import "server-only";

import { runTool, type ToolContext, type ToolResult } from "@/lib/whatsapp/ai/tools";
import type { ControllerOutput } from "@/lib/whatsapp/ai/schema";
import type { WhatsAppLanguage } from "@/lib/whatsapp/types";

// Stage 3 — compose a customer reply from VERIFIED tool results only. There is
// no second model call here: every number, date, reference and status comes
// straight out of a domain service. When the verified data isn't enough,
// `text` is null and the caller falls back to its deterministic handling.

export type LiveAnswer = {
  text: string | null;
  needsClarification?: string;
  allowedTool: string | null;
  toolOutcome: "none" | "ok" | "denied" | "error";
};

const NONE: LiveAnswer = { text: null, allowedTool: null, toolOutcome: "none" };

function mwk(n: number): string {
  return `MWK ${n.toLocaleString("en-MW")}`;
}
function outcomeOf(r: ToolResult): "ok" | "denied" | "error" {
  if (r.ok) return "ok";
  return r.error === "not_authorized" || r.error === "confirmation_required" ? "denied" : "error";
}

type RouteView = {
  routeId: string; label: string; origin: string; destination: string;
  pickup: string; fare: number | null; priced: boolean; universityShortCode: string | null;
};

export async function composeLiveAnswer(
  controller: ControllerOutput,
  ctx: ToolContext,
  _language: WhatsAppLanguage,
  opts: { env?: NodeJS.ProcessEnv } = {},
): Promise<LiveAnswer> {
  const env = opts.env;
  const e = controller.entities;
  const call = (name: string, input: unknown) => runTool(name, ctx, input, { env });

  const resolveRoute = async (): Promise<{ view: RouteView | null; denied: boolean }> => {
    if (!e.origin) return { view: null, denied: false };
    const r = await call("searchActiveRoutes", { origin: e.origin, destination: e.destination ?? "" });
    if (!r.ok) return { view: null, denied: r.error === "not_authorized" };
    const rows = (r.data as RouteView[]) ?? [];
    return { view: rows[0] ?? null, denied: false };
  };

  switch (controller.intent) {
    case "fare_question":
    case "route_search":
    case "schedule_question": {
      if (!e.origin) return { ...NONE, needsClarification: "Which town or city are you travelling from?", allowedTool: "searchActiveRoutes" };
      if (!e.destination) return { ...NONE, needsClarification: `Where would you like to travel to from ${e.origin}? You can name a district or a university such as MZUNI.`, allowedTool: "searchActiveRoutes" };
      const { view } = await resolveRoute();
      if (!view) {
        return { text: `I couldn't find an active route from ${e.origin} to ${e.destination} yet. You can view popular routes, request that route, or ask our team.`, allowedTool: "searchActiveRoutes", toolOutcome: "ok" };
      }
      if (controller.intent === "fare_question") {
        return {
          text: view.priced && view.fare != null
            ? `The current fare for ${view.label} is ${mwk(view.fare)}. Choose Make a Booking to reserve a seat.`
            : `${view.label} is an active route, but its fare hasn't been published yet. Our team can confirm it for you.`,
          allowedTool: "getPublicFare", toolOutcome: "ok",
        };
      }
      if (controller.intent === "schedule_question") {
        if (!e.travelDate) {
          return { text: `${view.label} is an active route. Tell me your travel date and I'll check for a scheduled trip — you can reserve either way.`, allowedTool: "findScheduledTrips", toolOutcome: "ok" };
        }
        const trips = await call("findScheduledTrips", { routeId: view.routeId, travelDate: e.travelDate });
        const list = trips.ok ? (trips.data as Array<{ departureTime: string | null; pickup: string }>) : [];
        return {
          text: list.length
            ? `Good news — there's a trip on ${e.travelDate}${list[0].departureTime ? ` at ${list[0].departureTime.slice(0, 5)}` : ""}, pickup ${list[0].pickup}. Choose Make a Booking to reserve.`
            : `We haven't scheduled a trip for ${e.travelDate} on ${view.label} yet, but you can still make a reservation and we'll notify you once it's confirmed.`,
          allowedTool: "findScheduledTrips", toolOutcome: trips.ok ? "ok" : outcomeOf(trips),
        };
      }
      return {
        text: `Yes, ${view.label} is an active route${view.priced && view.fare != null ? ` — fare ${mwk(view.fare)}` : ""}. Choose Make a Booking to reserve a seat.`,
        allowedTool: "searchActiveRoutes", toolOutcome: "ok",
      };
    }

    case "popular_routes": {
      const r = await call("listPopularRoutes", {});
      if (!r.ok) return { ...NONE, allowedTool: "listPopularRoutes", toolOutcome: outcomeOf(r) };
      const rows = (r.data as RouteView[]).slice(0, 5);
      return rows.length
        ? { text: `Popular routes right now: ${rows.map((x) => `${x.label}${x.priced && x.fare != null ? ` (${mwk(x.fare)})` : ""}`).join("; ")}. Choose Find a Route to book one.`, allowedTool: "listPopularRoutes", toolOutcome: "ok" }
        : { ...NONE, allowedTool: "listPopularRoutes", toolOutcome: "ok" };
    }

    case "university_search": {
      if (e.university) {
        const r = await call("resolveUniversity", { input: e.university });
        if (r.ok) {
          const u = r.data as { name: string; shortCode: string | null };
          return { text: `${u.shortCode ? `${u.shortCode} — ` : ""}${u.name} is an active destination. Choose Student Travel to book a trip there.`, allowedTool: "resolveUniversity", toolOutcome: "ok" };
        }
      }
      const list = await call("listActiveUniversities", {});
      if (!list.ok) return { ...NONE, allowedTool: "listActiveUniversities", toolOutcome: outcomeOf(list) };
      const unis = list.data as Array<{ name: string; shortCode: string | null }>;
      return unis.length
        ? { text: `We currently serve: ${unis.map((u) => u.shortCode || u.name).join(", ")}. Choose Student Travel to book.`, allowedTool: "listActiveUniversities", toolOutcome: "ok" }
        : { ...NONE, allowedTool: "listActiveUniversities", toolOutcome: "ok" };
    }

    case "my_bookings": {
      const r = await call("getCustomerBookings", {});
      if (!r.ok) return { ...NONE, allowedTool: "getCustomerBookings", toolOutcome: outcomeOf(r) };
      const rows = (r.data as Array<{ bookingId: string; routeLabel: string; travelDate: string; status: string; bookingFeeStatus: string }>);
      if (!rows.length) return { text: "You have no bookings linked to this WhatsApp number yet.", allowedTool: "getCustomerBookings", toolOutcome: "ok" };
      const shown = rows.slice(0, 3).map((b) => `${b.bookingId} — ${b.routeLabel}, ${b.travelDate} (${b.bookingFeeStatus === "paid" ? b.status : `${b.status}, fee unpaid`})`);
      const more = rows.length > 3 ? ` …and ${rows.length - 3} more — open My Bookings for the full list.` : "";
      return { text: `Your bookings:\n${shown.join("\n")}${more}`, allowedTool: "getCustomerBookings", toolOutcome: "ok" };
    }

    case "booking_details":
    case "payment_status":
    case "booking_deadline": {
      if (!e.bookingId) return { ...NONE, needsClarification: "What's your booking reference (it looks like BK-XXXXXXXX)?", allowedTool: "getCustomerBooking" };
      if (controller.intent === "payment_status") {
        const r = await call("getCustomerPaymentStatus", { bookingId: e.bookingId });
        if (!r.ok) return { text: r.error === "not_found" ? "I couldn't find a booking with that reference on this number." : null, allowedTool: "getCustomerPaymentStatus", toolOutcome: outcomeOf(r) };
        const d = r.data as { status: string; bookingFeeStatus: string; fareStatus: string };
        return {
          text: d.bookingFeeStatus === "paid"
            ? `Booking ${e.bookingId}: booking fee is confirmed as paid. Status: ${d.status}.`
            : `Booking ${e.bookingId}: our payment system has not confirmed the booking fee yet. Complete it on the secure PayChangu page, or ask our team with the reference.`,
          allowedTool: "getCustomerPaymentStatus", toolOutcome: "ok",
        };
      }
      if (controller.intent === "booking_deadline") {
        const r = await call("calculateBookingFeeDeadline", { bookingId: e.bookingId });
        if (!r.ok) return { text: r.error === "not_found" ? "I couldn't find a booking with that reference on this number." : null, allowedTool: "calculateBookingFeeDeadline", toolOutcome: outcomeOf(r) };
        const d = r.data as { deadline: string | null; bookingFeeStatus: string };
        return {
          text: d.bookingFeeStatus === "paid" ? `Booking ${e.bookingId}: the booking fee is already paid.`
            : d.deadline ? `Booking ${e.bookingId}: pay the booking fee by ${d.deadline} or the seat is released.`
            : `Booking ${e.bookingId}: pay the booking fee as soon as possible to hold the seat.`,
          allowedTool: "calculateBookingFeeDeadline", toolOutcome: "ok",
        };
      }
      const r = await call("getCustomerBooking", { bookingId: e.bookingId });
      if (!r.ok) return { text: r.error === "not_found" ? "I couldn't find a booking with that reference on this number." : null, allowedTool: "getCustomerBooking", toolOutcome: outcomeOf(r) };
      const b = r.data as { bookingId: string; routeLabel: string; travelDate: string; status: string; bookingFeeStatus: string; fareStatus: string };
      return { text: `Booking ${b.bookingId}\n${b.routeLabel}\nDate: ${b.travelDate}\nStatus: ${b.status}\nBooking fee: ${b.bookingFeeStatus}\nFare: ${b.fareStatus}`, allowedTool: "getCustomerBooking", toolOutcome: "ok" };
    }

    default:
      return NONE;
  }
}
