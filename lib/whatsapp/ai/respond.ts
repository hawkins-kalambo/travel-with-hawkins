import "server-only";

import { runTool, type ToolContext, type ToolResult } from "@/lib/whatsapp/ai/tools";
import { isAiFeatureEnabled } from "@/lib/whatsapp/ai/flags";
import type { ControllerOutput } from "@/lib/whatsapp/ai/schema";
import type { WhatsAppLanguage } from "@/lib/whatsapp/types";

// Stage 3 + Phase A1. Two steps:
//   gatherFacts()   – run the tools the turn needs, collect VERIFIED results
//                     into a flat fact pack (strings/numbers straight from a
//                     domain service).
//   formatFromPack()– turn the pack into a deterministic reply (the fallback,
//                     and what the synthesis guard is checked against).
// There is never a model call in this file.

export type FactItem = { label: string; value: string };

export type FactPack = {
  intent: string;
  facts: FactItem[];
  allowedTool: string | null;
  toolOutcome: "none" | "ok" | "denied" | "error";
  needsClarification?: string;
  // Structured bits the deterministic formatter reads.
  route: RouteView | null;
  // Other verified active routes from the same origin (routeAlternatives flag).
  alternatives: RouteView[];
  trip: { departureTime: string | null; pickup: string } | null;
  popular: RouteView[];
  universities: { name: string; shortCode: string | null }[];
  bookings: BookingRow[];
  booking: BookingRow | null;
  payment: { status: string; bookingFeeStatus: string; fareStatus: string } | null;
  deadline: { deadline: string | null; bookingFeeStatus: string } | null;
};

export type LiveAnswer = {
  text: string | null;
  needsClarification?: string;
  allowedTool: string | null;
  toolOutcome: "none" | "ok" | "denied" | "error";
};

type RouteView = {
  routeId: string; label: string; origin: string; destination: string;
  pickup: string; fare: number | null; priced: boolean; universityShortCode: string | null;
};
type BookingRow = {
  bookingId: string; routeLabel: string; travelDate: string; status: string;
  bookingFeeStatus: string; fareStatus?: string;
};

function mwk(n: number): string { return `MWK ${n.toLocaleString("en-MW")}`; }
function outcomeOf(r: ToolResult): "ok" | "denied" | "error" {
  if (r.ok) return "ok";
  return r.error === "not_authorized" || r.error === "confirmation_required" ? "denied" : "error";
}

function emptyPack(intent: string): FactPack {
  return {
    intent, facts: [], allowedTool: null, toolOutcome: "none",
    route: null, alternatives: [], trip: null, popular: [], universities: [], bookings: [], booking: null,
    payment: null, deadline: null,
  };
}

// --------------------------------------------------------------------------
export async function gatherFacts(
  controller: ControllerOutput, ctx: ToolContext, opts: { env?: NodeJS.ProcessEnv } = {},
): Promise<FactPack> {
  const env = opts.env;
  const e = controller.entities;
  const pack = emptyPack(controller.intent);
  const call = (name: string, input: unknown) => runTool(name, ctx, input, { env });
  const add = (label: string, value: string | number | null | undefined) => {
    if (value === null || value === undefined || value === "") return;
    pack.facts.push({ label, value: String(value) });
  };

  const resolveRoute = async () => {
    if (!e.origin) return;
    const r = await call("searchActiveRoutes", { origin: e.origin, destination: e.destination ?? e.university ?? "" });
    pack.allowedTool = "searchActiveRoutes";
    if (!r.ok) { pack.toolOutcome = outcomeOf(r); return; }
    pack.toolOutcome = "ok";
    pack.route = ((r.data as RouteView[]) ?? [])[0] ?? null;
    if (pack.route) {
      add("route", pack.route.label);
      if (pack.route.priced && pack.route.fare != null) add("fare", mwk(pack.route.fare));
      else add("fare status", "not published yet");
      add("pickup", pack.route.pickup);
      if (pack.route.universityShortCode) add("university", pack.route.universityShortCode);
    }
  };

  // Other verified routes from the same origin, cheapest first — only when the
  // routeAlternatives feature is on. Never invents a corridor: every row comes
  // straight from searchActiveRoutes.
  const gatherAlternatives = async () => {
    if (!e.origin || !isAiFeatureEnabled("routeAlternatives", env)) return;
    const r = await call("searchActiveRoutes", { origin: e.origin, destination: "" });
    if (!r.ok) return;
    const rows = ((r.data as RouteView[]) ?? [])
      .filter((x) => x.priced && x.fare != null && x.routeId !== pack.route?.routeId)
      .sort((a, b) => (a.fare ?? 0) - (b.fare ?? 0))
      .slice(0, 3);
    pack.alternatives = rows;
    for (const x of rows) add("alternative route", `${x.label} (${mwk(x.fare as number)})`);
  };

  switch (controller.intent) {
    case "fare_question":
    case "route_search":
    case "schedule_question":
    case "pickup_question": {
      if (!e.origin) { pack.needsClarification = "Which town or city are you travelling from?"; pack.allowedTool = "searchActiveRoutes"; return pack; }
      if (!e.destination && !e.university) { pack.needsClarification = `Where would you like to travel to from ${e.origin}? A district, or a university such as MZUNI.`; pack.allowedTool = "searchActiveRoutes"; return pack; }
      await resolveRoute();
      if (controller.intent === "fare_question" || controller.intent === "route_search") await gatherAlternatives();
      if (pack.route && (controller.intent === "schedule_question" || controller.intent === "route_search") && e.travelDate) {
        const trips = await call("findScheduledTrips", { routeId: pack.route.routeId, travelDate: e.travelDate });
        if (trips.ok) {
          const list = trips.data as Array<{ departureTime: string | null; pickup: string }>;
          pack.trip = list[0] ?? null;
          add("requested date", e.travelDate);
          add("scheduled trip", list.length
            ? `yes${list[0].departureTime ? ` at ${list[0].departureTime.slice(0, 5)}` : ""}, pickup ${list[0].pickup}`
            : "none scheduled for that date");
        }
      }
      return pack;
    }

    case "popular_routes": {
      const r = await call("listPopularRoutes", {});
      pack.allowedTool = "listPopularRoutes"; pack.toolOutcome = outcomeOf(r);
      if (r.ok) {
        pack.popular = (r.data as RouteView[]).slice(0, 6);
        for (const x of pack.popular) add("popular route", `${x.label}${x.priced && x.fare != null ? ` (${mwk(x.fare)})` : ""}`);
      }
      return pack;
    }

    case "university_search": {
      if (e.university) {
        const r = await call("resolveUniversity", { input: e.university });
        pack.allowedTool = "resolveUniversity"; pack.toolOutcome = outcomeOf(r);
        if (r.ok) { const u = r.data as { name: string; shortCode: string | null }; pack.universities = [u]; add("university", `${u.shortCode ? `${u.shortCode} — ` : ""}${u.name}`); return pack; }
      }
      const list = await call("listActiveUniversities", {});
      pack.allowedTool = "listActiveUniversities"; pack.toolOutcome = outcomeOf(list);
      if (list.ok) {
        pack.universities = list.data as Array<{ name: string; shortCode: string | null }>;
        add("active universities", pack.universities.map((u) => u.shortCode || u.name).join(", "));
      }
      return pack;
    }

    case "my_bookings": {
      const r = await call("getCustomerBookings", {});
      pack.allowedTool = "getCustomerBookings"; pack.toolOutcome = outcomeOf(r);
      if (r.ok) {
        pack.bookings = (r.data as BookingRow[]);
        if (!pack.bookings.length) add("bookings", "none on this number");
        for (const b of pack.bookings.slice(0, 4)) {
          add("booking", `${b.bookingId} — ${b.routeLabel}, ${b.travelDate} (${b.bookingFeeStatus === "paid" ? b.status : `${b.status}, fee unpaid`})`);
        }
        if (pack.bookings.length > 4) add("more bookings", `${pack.bookings.length - 4}`);
      }
      return pack;
    }

    case "booking_details":
    case "payment_status":
    case "booking_deadline":
    case "receipt_request": {
      if (!e.bookingId) { pack.needsClarification = "What's your booking reference (it looks like BK-XXXXXXXX)?"; pack.allowedTool = "getCustomerBooking"; return pack; }
      if (controller.intent === "payment_status") {
        const r = await call("getCustomerPaymentStatus", { bookingId: e.bookingId });
        pack.allowedTool = "getCustomerPaymentStatus"; pack.toolOutcome = outcomeOf(r);
        if (r.ok) { pack.payment = r.data as FactPack["payment"]; add("booking", e.bookingId); add("booking fee", pack.payment!.bookingFeeStatus); add("status", pack.payment!.status); }
        else if (r.error === "not_found") add("lookup", "no booking with that reference on this number");
        return pack;
      }
      if (controller.intent === "booking_deadline") {
        const r = await call("calculateBookingFeeDeadline", { bookingId: e.bookingId });
        pack.allowedTool = "calculateBookingFeeDeadline"; pack.toolOutcome = outcomeOf(r);
        if (r.ok) { pack.deadline = r.data as FactPack["deadline"]; add("booking", e.bookingId); add("booking fee", pack.deadline!.bookingFeeStatus); if (pack.deadline!.deadline) add("fee deadline", pack.deadline!.deadline); }
        else if (r.error === "not_found") add("lookup", "no booking with that reference on this number");
        return pack;
      }
      const r = await call("getCustomerBooking", { bookingId: e.bookingId });
      pack.allowedTool = "getCustomerBooking"; pack.toolOutcome = outcomeOf(r);
      if (r.ok) {
        pack.booking = r.data as BookingRow;
        add("booking", pack.booking.bookingId); add("route", pack.booking.routeLabel);
        add("travel date", pack.booking.travelDate); add("status", pack.booking.status);
        add("booking fee", pack.booking.bookingFeeStatus); add("fare", pack.booking.fareStatus ?? "");
      } else if (r.error === "not_found") add("lookup", "no booking with that reference on this number");
      return pack;
    }

    default:
      return pack;
  }
}

function altLine(pack: FactPack): string {
  if (!pack.alternatives.length) return "";
  const list = pack.alternatives.map((x) => `${x.label} (${mwk(x.fare as number)})`).join("; ");
  return ` Other routes from ${pack.alternatives[0].origin}: ${list}.`;
}

// --------------------------------------------------------------------------
// Deterministic reply from the pack — the fallback, and the guard baseline.
export function formatFromPack(controller: ControllerOutput, pack: FactPack): LiveAnswer {
  const base = { allowedTool: pack.allowedTool, toolOutcome: pack.toolOutcome };
  if (pack.needsClarification) return { text: null, needsClarification: pack.needsClarification, ...base };

  switch (controller.intent) {
    case "fare_question": {
      if (!pack.route) return { text: `I couldn't find an active route from ${controller.entities.origin} to ${controller.entities.destination ?? controller.entities.university}.${altLine(pack) || " You can view popular routes, request that route, or ask our team."}`, ...base };
      return {
        text: (pack.route.priced && pack.route.fare != null
          ? `The current fare for ${pack.route.label} is ${mwk(pack.route.fare)}. Choose Make a Booking to reserve a seat.`
          : `${pack.route.label} is an active route, but its fare hasn't been published yet. Our team can confirm it for you.`) + altLine(pack),
        ...base,
      };
    }
    case "schedule_question": {
      if (!pack.route) return { text: `I couldn't find an active route from ${controller.entities.origin} to ${controller.entities.destination ?? controller.entities.university}.`, ...base };
      if (!controller.entities.travelDate) return { text: `${pack.route.label} is an active route. Tell me your travel date and I'll check for a scheduled trip — you can reserve either way.`, ...base };
      return {
        text: pack.trip
          ? `Good news — there's a trip on ${controller.entities.travelDate}${pack.trip.departureTime ? ` at ${pack.trip.departureTime.slice(0, 5)}` : ""}, pickup ${pack.trip.pickup}. Choose Make a Booking to reserve.`
          : `We haven't scheduled a trip for ${controller.entities.travelDate} on ${pack.route.label} yet, but you can still make a reservation and we'll notify you once it's confirmed.`,
        ...base,
      };
    }
    case "route_search": {
      if (!pack.route) return { text: `I couldn't find an active route from ${controller.entities.origin} to ${controller.entities.destination ?? controller.entities.university}.${altLine(pack) || " You can view popular routes or request it."}`, ...base };
      return { text: `Yes, ${pack.route.label} is an active route${pack.route.priced && pack.route.fare != null ? ` — fare ${mwk(pack.route.fare)}` : ""}. Choose Make a Booking to reserve a seat.${altLine(pack)}`, ...base };
    }
    case "pickup_question": {
      if (!pack.route) return { text: `Tell me the route and I'll give you the pickup point.`, ...base };
      return { text: `For ${pack.route.label}, the pickup point is ${pack.route.pickup}. The exact boarding time is confirmed once a trip is assigned.`, ...base };
    }
    case "popular_routes": {
      if (!pack.popular.length) return { text: null, ...base };
      return { text: `Popular routes right now: ${pack.popular.map((x) => `${x.label}${x.priced && x.fare != null ? ` (${mwk(x.fare)})` : ""}`).join("; ")}. Choose Find a Route to book one.`, ...base };
    }
    case "university_search": {
      if (!pack.universities.length) return { text: null, ...base };
      const list = pack.universities.map((u) => u.shortCode || u.name).join(", ");
      return { text: `We currently serve: ${list}. Choose Student Travel to book.`, ...base };
    }
    case "my_bookings": {
      if (base.toolOutcome === "denied" || base.toolOutcome === "error") return { text: null, ...base };
      if (!pack.bookings.length) return { text: "You have no bookings linked to this WhatsApp number yet.", ...base };
      const shown = pack.bookings.slice(0, 3).map((b) => `${b.bookingId} — ${b.routeLabel}, ${b.travelDate} (${b.bookingFeeStatus === "paid" ? b.status : `${b.status}, fee unpaid`})`);
      const more = pack.bookings.length > 3 ? ` …and ${pack.bookings.length - 3} more — open My Bookings for the full list.` : "";
      return { text: `Your bookings:\n${shown.join("\n")}${more}`, ...base };
    }
    case "payment_status": {
      if (!pack.payment) return { text: base.toolOutcome === "error" && pack.facts.some((f) => f.value.includes("no booking")) ? "I couldn't find a booking with that reference on this number." : null, ...base };
      return {
        text: pack.payment.bookingFeeStatus === "paid"
          ? `Booking ${controller.entities.bookingId}: booking fee is confirmed as paid. Status: ${pack.payment.status}.`
          : `Booking ${controller.entities.bookingId}: our payment system has not confirmed the booking fee yet. Complete it on the secure PayChangu page, or ask our team with the reference.`,
        ...base,
      };
    }
    case "booking_deadline": {
      if (!pack.deadline) return { text: null, ...base };
      return {
        text: pack.deadline.bookingFeeStatus === "paid" ? `Booking ${controller.entities.bookingId}: the booking fee is already paid.`
          : pack.deadline.deadline ? `Booking ${controller.entities.bookingId}: pay the booking fee by ${pack.deadline.deadline} or the seat is released.`
          : `Booking ${controller.entities.bookingId}: pay the booking fee as soon as possible to hold the seat.`,
        ...base,
      };
    }
    case "booking_details": {
      if (!pack.booking) return { text: null, ...base };
      const b = pack.booking;
      return { text: `Booking ${b.bookingId}\n${b.routeLabel}\nDate: ${b.travelDate}\nStatus: ${b.status}\nBooking fee: ${b.bookingFeeStatus}\nFare: ${b.fareStatus ?? "—"}`, ...base };
    }
    case "receipt_request":
      return { text: `We issue a receipt once the booking fee is confirmed. If your fee is paid and you haven't received it, ask our team with your booking reference.`, ...base };
    case "cancellation_information":
      return { text: `Cancellations and refunds are handled case by case and can depend on timing, the operator and how you paid. Please ask our team with your booking reference.`, ...base };
    case "change_request":
      return { text: `To change a date, route or passenger on an existing booking, contact our team with the booking reference as early as possible — changes depend on availability and the operator.`, ...base };
    default:
      return { text: null, ...base };
  }
}

// Thin wrapper kept for callers/tests that want one call.
export async function composeLiveAnswer(
  controller: ControllerOutput, ctx: ToolContext, _language: WhatsAppLanguage,
  opts: { env?: NodeJS.ProcessEnv } = {},
): Promise<LiveAnswer> {
  return formatFromPack(controller, await gatherFacts(controller, ctx, opts));
}

// Plain-text FACTS block for the synthesis prompt. Only verified values.
export function renderPack(pack: FactPack): string {
  return pack.facts.map((f) => `- ${f.label}: ${f.value}`).join("\n");
}
