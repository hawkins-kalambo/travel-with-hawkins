import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { contactMatchesBooking, loadBookingById } from "@/lib/bookingAccess";
import { generateBookingId, generateTripId } from "@/lib/bookingServerUtils";
import { initiatePayChanguPayment } from "@/lib/payments/payment-service";
import { verifyAndFinalizePayment } from "@/lib/payments/finalize-flow";
import { FINAL_CUTOFF_HOURS, WHATSAPP_POLICY_VERSION, departureEpochMs } from "@/lib/whatsapp/booking-rules";
import type { BookingDraft, WhatsAppConversationState } from "@/lib/whatsapp/types";

export type AvailableDeparture = {
  id: string; routeId: string; routeLabel: string; travelDate: string;
  departureTime?: string; fare: number; pickup: string; availableSeats: number;
};

// Same embed shape used by findAvailableDepartures and the booking-before-trip
// route picker. `routes` has no `destination_label` column (see the note in
// findAvailableDepartures) — the destination comes from the linked university.
const ROUTE_SELECT =
  "id, origin_district, university_id, destination_district, route_type, is_popular, popular_order, fare, status, direction, university:universities(name,short_code,status), pickupPoint:university_pickup_points(label,status), districtPickupPoint:district_pickup_points(label,status)";

function embedsActive(route: Record<string, unknown>): boolean {
  const university = related(route.university);
  const campus = related(route.pickupPoint);
  const district = related(route.districtPickupPoint);
  return (!university || university.status === "active")
    && (!campus || campus.status === "active") && (!district || district.status === "active");
}

export type RouteType = "student" | "general" | "both";

export type BookableRoute = {
  routeId: string; label: string; origin: string; destination: string;
  pickup: string; fare: number; priced: boolean;
  routeType: RouteType; isPopular: boolean;
  // `label` keeps the full destination name (stored on the booking, shown in
  // confirmations). `menuLabel` is the compact form for WhatsApp list rows —
  // the university short code (MZUNI) instead of the full name.
  menuLabel: string;
  universityId: string | null;
  universityName: string | null;
  universityShortCode: string | null;
};

// Build the customer-facing view of a `routes` row. Returns null when there is
// nothing safe to show as a destination:
//   - a student/both route with no linked university, or
//   - a general route with no destination_district.
function toBookableRoute(route: Record<string, unknown>): BookableRoute | null {
  const routeType = (["student", "general", "both"].includes(String(route.route_type))
    ? String(route.route_type) : "student") as RouteType;
  const isPopular = Boolean(route.is_popular);
  const origin = String(route.origin_district || "").trim();
  const university = related(route.university);
  const campus = related(route.pickupPoint);
  const district = related(route.districtPickupPoint);
  const fare = Number(route.fare) || 0;

  // District-to-district travel with no university on either end.
  if (route.direction === "general") {
    const destination = String(route.destination_district || "").trim();
    if (!origin || !destination) return null;
    const pickup = String(district?.label || origin);
    const label = `${origin} - ${destination}`;
    return {
      routeId: String(route.id), label, menuLabel: label,
      origin, destination, pickup, fare, priced: fare > 0, routeType, isPopular,
      universityId: null, universityName: null, universityShortCode: null,
    };
  }

  const universityName = String(university?.name || "").trim();
  if (!universityName) return null;
  const shortCode = String(university?.short_code || "").trim() || null;
  const menuName = shortCode || universityName;
  const reverse = route.direction === "from_university";
  const label = reverse ? `${universityName} - ${origin}` : `${origin} - ${universityName}`;
  const menuLabel = reverse ? `${menuName} - ${origin}` : `${origin} - ${menuName}`;
  const pickup = String((reverse ? campus?.label : district?.label) || (reverse ? universityName : origin));
  return {
    routeId: String(route.id), label, menuLabel, origin, destination: universityName,
    pickup, fare, priced: fare > 0, routeType, isPopular,
    universityId: route.university_id ? String(route.university_id) : null,
    universityName, universityShortCode: shortCode,
  };
}

// Booking fee is a single configured amount (settings.booking_fee, MWK).
// Read the same way create_capacity_checked_booking() reads it, for the
// pre-confirmation preview only — the RPC re-reads it at creation time.
export async function getBookingFeeAmount(): Promise<number> {
  const result = await supabaseAdmin.from("settings").select("booking_fee")
    .order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (result.error || !result.data) return 0;
  return Number(result.data.booking_fee) || 0;
}

function related(value: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(value)) return value[0] as Record<string, unknown> | undefined;
  return value && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

export async function findAvailableDepartures(origin?: string, departureId?: string): Promise<AvailableDeparture[]> {
  // `routes` has no `destination_label` column (it is not in any migration and
  // no other query selects it); the destination is derived from the linked
  // university below. Selecting a non-existent column makes PostgREST reject
  // the whole request, which is what left customers stuck at "route_origin".
  let routeQuery = supabaseAdmin.from("routes").select(
    "id, origin_district, university_id, fare, status, direction, university:universities(name,status), pickupPoint:university_pickup_points(label,status), districtPickupPoint:district_pickup_points(label,status)"
  ).eq("status", "active").gt("fare", 0).limit(50);
  if (origin?.trim()) routeQuery = routeQuery.ilike("origin_district", origin.trim());
  const routesResult = await routeQuery;
  if (routesResult.error) throw routesResult.error;

  const routes = (routesResult.data ?? []).filter((route) => {
    const university = related(route.university);
    const campus = related(route.pickupPoint);
    const district = related(route.districtPickupPoint);
    return (!university || university.status === "active")
      && (!campus || campus.status === "active") && (!district || district.status === "active");
  });
  const ids = routes.map((route) => route.id);
  if (!ids.length) return [];

  const today = new Date().toISOString().slice(0, 10);
  let departureQuery = supabaseAdmin.from("route_departures").select("*")
    .in("route_id", ids).eq("status", "published").gte("travel_date", today);
  if (departureId) departureQuery = departureQuery.eq("id", departureId);
  const departureResult = await departureQuery.order("travel_date", { ascending: true }).limit(50);
  if (departureResult.error) throw departureResult.error;
  const departures = departureResult.data ?? [];
  if (!departures.length) return [];

  const bookingResult = await supabaseAdmin.from("bookings").select("departure_id,seats,status")
    .in("departure_id", departures.map((row) => row.id));
  if (bookingResult.error) throw bookingResult.error;
  const reserved = new Map<string, number>();
  for (const booking of bookingResult.data ?? []) {
    if (["cancelled", "expired"].includes(String(booking.status || "").toLowerCase())) continue;
    reserved.set(booking.departure_id, (reserved.get(booking.departure_id) || 0) + (Number(booking.seats) || 1));
  }
  const routeMap = new Map(routes.map((route) => [route.id, route]));
  const cutoffMs = Date.now() + FINAL_CUTOFF_HOURS * 3_600_000;
  return departures.flatMap((departure): AvailableDeparture[] => {
    const route = routeMap.get(departure.route_id);
    if (!route) return [];
    const availableSeats = Number(departure.capacity) - (reserved.get(departure.id) || 0);
    if (availableSeats <= 0) return [];
    // D02: never offer a departure within the final 24h cutoff.
    if (departureEpochMs(departure.travel_date, departure.departure_time) <= cutoffMs) return [];
    const university = related(route.university);
    const campus = related(route.pickupPoint);
    const district = related(route.districtPickupPoint);
    const destination = String(university?.name || "").trim();
    if (!destination) return [];
    const reverse = route.direction === "from_university";
    const routeLabel = reverse ? `${destination} - ${route.origin_district}` : `${route.origin_district} - ${destination}`;
    const pickup = String((reverse ? campus?.label : district?.label) || (reverse ? destination : route.origin_district));
    return [{ id: departure.id, routeId: route.id, routeLabel, travelDate: departure.travel_date,
      departureTime: departure.departure_time || undefined, fare: Number(route.fare), pickup, availableSeats }];
  }).slice(0, departureId ? 1 : 10);
}

export async function loadDeparture(departureId: string): Promise<AvailableDeparture | null> {
  const all = await findAvailableDepartures(undefined, departureId);
  return all.find((departure) => departure.id === departureId) ?? null;
}

// After a customer picks a route + date: is there a published trip on that
// exact route and date with seats left? (§8 — the flow shows verified trip
// info when one exists, and an "assigned later" reservation when it does not.)
export async function findDepartureForRouteDate(
  routeId: string, travelDate: string,
): Promise<AvailableDeparture | null> {
  if (!routeId || !travelDate) return null;
  const all = await findAvailableDepartures();
  return all.find((d) => d.routeId === routeId && d.travelDate === travelDate) ?? null;
}

export type CreateWhatsAppBookingResult =
  | { outcome: "created" | "existing"; bookingId: string; expiresAt: string | null; fare: number; bookingFee: number; shortNotice: boolean }
  | { outcome: "rejected"; reason: string };

export async function createWhatsAppBooking(
  conversation: WhatsAppConversationState, draft: BookingDraft, operationKey: string
): Promise<CreateWhatsAppBookingResult> {
  if (!draft.departureId || !draft.name) return { outcome: "rejected", reason: "incomplete_booking" };
  // Recheck the departure at confirm time (price/capacity/24h cutoff) — the
  // RPC is the final authority, this is a fast pre-check.
  const departure = await loadDeparture(draft.departureId);
  if (!departure) return { outcome: "rejected", reason: "departure_unavailable" };
  const bookingId = generateBookingId();
  const tripId = generateTripId(departure.routeLabel, departure.travelDate);
  const result = await supabaseAdmin.rpc("create_capacity_checked_booking", {
    p_operation_key: operationKey, p_booking_id: bookingId, p_trip_id: tripId,
    p_departure_id: departure.id, p_name: draft.name, p_phone: conversation.waId,
    p_email: draft.email || "", p_student_id: draft.studentId || "", p_seats: 1,
    p_destination: departure.routeLabel, p_pickup: departure.pickup, p_location: departure.pickup,
    p_booking_type: "WhatsApp",
    p_whatsapp_contact_id: conversation.contactId,
    p_policy_version: WHATSAPP_POLICY_VERSION,
  });
  if (result.error) throw result.error;
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!row || row.outcome === "rejected") return { outcome: "rejected", reason: row?.reason || "booking_failed" };
  await supabaseAdmin.from("whatsapp_booking_operations").upsert({
    operation_key: operationKey, conversation_id: conversation.conversationId,
    booking_id: row.booking_id, status: "completed", updated_at: new Date().toISOString(),
  }, { onConflict: "operation_key" });
  const expiresAt: string | null = row.expires_at ?? null;
  const shortNotice = expiresAt ? Date.parse(expiresAt) - Date.now() < 30 * 60 * 1000 : false;
  return {
    outcome: row.outcome, bookingId: row.booking_id, expiresAt,
    fare: Number(row.fare) || departure.fare, bookingFee: Number(row.booking_fee) || 0, shortNotice,
  };
}

export type WhatsAppBookingSummary = {
  bookingId: string; routeLabel: string; travelDate: string; status: string;
  bookingFeeStatus: string; fareStatus: string; expiresAt: string | null;
};

// Bookings securely linked to this WhatsApp contact (set only by the RPC).
export async function listWhatsAppBookings(contactId: string): Promise<WhatsAppBookingSummary[]> {
  const result = await supabaseAdmin.from("bookings")
    .select("booking_id,destination,travel_date,status,booking_fee_status,fare_status,booking_expires_at")
    .eq("whatsapp_contact_id", contactId)
    .order("created_at", { ascending: false }).limit(30);
  if (result.error) throw result.error;
  return (result.data ?? []).map((row) => ({
    bookingId: String(row.booking_id),
    routeLabel: String(row.destination || "Trip"),
    travelDate: String(row.travel_date || ""),
    status: String(row.status || "Booked"),
    bookingFeeStatus: String(row.booking_fee_status || "unpaid"),
    fareStatus: String(row.fare_status || "unpaid"),
    expiresAt: row.booking_expires_at ?? null,
  }));
}

export async function loadWhatsAppBooking(bookingId: string, contactId: string): Promise<WhatsAppBookingSummary | null> {
  const result = await supabaseAdmin.from("bookings")
    .select("booking_id,destination,travel_date,status,booking_fee_status,fare_status,booking_expires_at")
    .eq("booking_id", bookingId).eq("whatsapp_contact_id", contactId).maybeSingle();
  if (result.error || !result.data) return null;
  const row = result.data;
  return {
    bookingId: String(row.booking_id), routeLabel: String(row.destination || "Trip"),
    travelDate: String(row.travel_date || ""), status: String(row.status || "Booked"),
    bookingFeeStatus: String(row.booking_fee_status || "unpaid"), fareStatus: String(row.fare_status || "unpaid"),
    expiresAt: row.booking_expires_at ?? null,
  };
}

export type CancelWhatsAppBookingResult = { outcome: "cancelled" | "needs_agent" | "not_found" };

// Pilot scope: the bot only cancels its own unpaid, not-yet-departed
// reservations (Booked). Anything paid, further along, or ambassador-linked
// goes to an agent — the existing admin cancellation path (commission
// reversal, refunds) is not reimplemented here.
export async function cancelWhatsAppBooking(bookingId: string, contactId: string): Promise<CancelWhatsAppBookingResult> {
  const current = await supabaseAdmin.from("bookings")
    .select("booking_id,status,booking_fee_status,ambassador_id")
    .eq("booking_id", bookingId).eq("whatsapp_contact_id", contactId).maybeSingle();
  if (current.error || !current.data) return { outcome: "not_found" };
  const status = String(current.data.status || "Booked").toLowerCase();
  if (current.data.booking_fee_status === "paid" || status !== "booked" || current.data.ambassador_id) {
    return { outcome: "needs_agent" };
  }
  // `bookings` has no cancellation_reason / updated_at column here — set only
  // status; the whatsapp_contact_id + Booked guard keeps this to the bot's
  // own not-yet-departed reservations.
  const updated = await supabaseAdmin.from("bookings").update({ status: "Cancelled" })
    .eq("booking_id", bookingId).eq("whatsapp_contact_id", contactId).eq("status", "Booked")
    .select("booking_id").maybeSingle();
  if (updated.error || !updated.data) return { outcome: "needs_agent" };
  return { outcome: "cancelled" };
}

export type BookingTrackingView = {
  bookingId: string; route: string; travelDate: string; journeyStatus: string;
  paymentStatus: string; pickup: string;
};

export async function trackBookingForWhatsApp(bookingId: string, waId: string): Promise<BookingTrackingView | null> {
  const lookup = await loadBookingById(bookingId);
  if (!lookup.found || !contactMatchesBooking(lookup.booking, waId)) return null;
  const booking = lookup.booking;
  return {
    bookingId: booking.bookingId || bookingId, route: booking.destination || "Unavailable",
    travelDate: booking.travelDate || "Unavailable", journeyStatus: booking.status || "Booked",
    paymentStatus: booking.bookingFeeStatus || "unpaid", pickup: booking.pickup || "Unavailable",
  };
}

export type BookingFeeAction =
  | { outcome: "paid" }
  | { outcome: "checkout"; url: string; amount: number }
  | { outcome: "rejected"; reason: string };

export async function getOrCreateBookingFeeCheckout(bookingId: string, waId: string): Promise<BookingFeeAction> {
  const lookup = await loadBookingById(bookingId);
  if (!lookup.found || !contactMatchesBooking(lookup.booking, waId)) return { outcome: "rejected", reason: "booking_not_found" };
  if (lookup.booking.bookingFeeStatus === "paid") return { outcome: "paid" };
  const existing = await supabaseAdmin.from("payments").select("internal_reference,expected_amount,metadata,status")
    .eq("booking_id", lookup.booking.bookingId).eq("payment_type", "booking_fee")
    .in("status", ["initialized", "processing"]).order("initialized_at", { ascending: false }).limit(1).maybeSingle();
  if (!existing.error && existing.data) {
    const verification = await verifyAndFinalizePayment(String(existing.data.internal_reference));
    if (verification.outcome === "finalized" || verification.outcome === "already_finalized") return { outcome: "paid" };
    const metadata = existing.data.metadata as Record<string, unknown> | null;
    const url = typeof metadata?.checkout_url === "string" ? metadata.checkout_url : "";
    if (url.startsWith("https://")) return { outcome: "checkout", url, amount: Number(existing.data.expected_amount) };
  }
  const result = await initiatePayChanguPayment({ bookingId, contact: waId, paymentType: "booking_fee", customerId: null });
  return result.outcome === "initialized"
    ? { outcome: "checkout", url: result.checkoutUrl, amount: result.amount }
    : { outcome: "rejected", reason: result.reason };
}

// ---------------------------------------------------------------------------
// Booking before a trip is created (master plan §A / Stage 2.1).
// A customer picks a supported route and a preferred future date when there is
// no scheduled route_departures row. The booking is real but "unassigned"
// (departure_id IS NULL) until an admin links transport later.
// ---------------------------------------------------------------------------

// Supported routes offered when there are no scheduled departures. Unpriced
// routes are still listed — the customer may request one and it is flagged for
// an agent rather than guessed at (see createUnassignedWhatsAppBooking).
export async function listBookableRoutes(origin?: string): Promise<BookableRoute[]> {
  let query = supabaseAdmin.from("routes").select(ROUTE_SELECT).eq("status", "active").limit(50);
  if (origin?.trim()) query = query.ilike("origin_district", origin.trim());
  const result = await query;
  if (result.error) throw result.error;
  return (result.data ?? [])
    .filter((route) => embedsActive(route))
    .map((route) => toBookableRoute(route))
    .filter((route): route is BookableRoute => route !== null)
    .slice(0, 10);
}

export async function loadBookableRoute(routeId: string): Promise<BookableRoute | null> {
  const result = await supabaseAdmin.from("routes").select(ROUTE_SELECT)
    .eq("id", routeId).eq("status", "active").maybeSingle();
  if (result.error || !result.data) return null;
  if (!embedsActive(result.data)) return null;
  return toBookableRoute(result.data);
}

// ---------------------------------------------------------------------------
// Structured route discovery for the WhatsApp "Find a Route" experience
// (master plan: "Improved Routes, Student Travel and General Travel Flow").
// These read the same `routes` / `universities` tables the website and admin
// use — no parallel configuration.
// ---------------------------------------------------------------------------

function eqi(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// Admin-curated "Popular Routes", ordered by popular_order (nulls last), then
// label. Only active routes with active embeds are shown.
export async function listPopularRoutes(): Promise<BookableRoute[]> {
  const result = await supabaseAdmin.from("routes").select(ROUTE_SELECT)
    .eq("status", "active").eq("is_popular", true)
    .order("popular_order", { ascending: true, nullsFirst: false }).limit(50);
  if (result.error) throw result.error;
  const views: BookableRoute[] = [];
  for (const route of result.data ?? []) {
    if (!embedsActive(route)) continue;
    const view = toBookableRoute(route);
    if (view) views.push(view);
  }
  return views.slice(0, 30);
}

// A district-to-district general route, matched in either orientation. When the
// stored row runs the other way, the returned view is re-oriented to the
// requested origin -> destination so the customer sees what they asked for.
export async function findGeneralRoute(origin: string, destination: string): Promise<BookableRoute | null> {
  if (!origin.trim() || !destination.trim()) return null;
  const result = await supabaseAdmin.from("routes").select(ROUTE_SELECT)
    .eq("status", "active").eq("direction", "general").limit(200);
  if (result.error) throw result.error;
  for (const route of result.data ?? []) {
    if (!embedsActive(route)) continue;
    const a = String(route.origin_district || "");
    const b = String(route.destination_district || "");
    const forward = eqi(a, origin) && eqi(b, destination);
    const backward = eqi(a, destination) && eqi(b, origin);
    if (!forward && !backward) continue;
    const view = toBookableRoute(route);
    if (!view) continue;
    if (backward) {
      return { ...view, label: `${b} - ${a}`, origin: b, destination: a, pickup: b };
    }
    return view;
  }
  return null;
}

// A student route (home district <-> a specific university) for one direction.
export async function findStudentRoute(
  homeDistrict: string, universityId: string, direction: "to_university" | "from_university",
): Promise<BookableRoute | null> {
  if (!homeDistrict.trim() || !universityId) return null;
  const result = await supabaseAdmin.from("routes").select(ROUTE_SELECT)
    .eq("status", "active").eq("university_id", universityId).eq("direction", direction)
    .ilike("origin_district", homeDistrict.trim()).limit(10);
  if (result.error) throw result.error;
  const row = (result.data ?? []).find((route) => embedsActive(route));
  return row ? toBookableRoute(row) : null;
}

export type ActiveUniversity = { id: string; name: string; shortCode: string | null };

// Active universities only — the student flow never offers one that is not
// live, and never hard-codes the list. `short_code` is the abbreviation shown
// in compact WhatsApp menus (universities.short_code is NOT NULL in schema, so
// the fallback to `name` is defensive only).
export async function listActiveUniversities(): Promise<ActiveUniversity[]> {
  const result = await supabaseAdmin.from("universities").select("id, name, short_code, status")
    .eq("status", "active").order("name", { ascending: true }).limit(50);
  if (result.error) throw result.error;
  return (result.data ?? [])
    .map((row) => ({
      id: String(row.id), name: String(row.name || ""),
      shortCode: String(row.short_code || "").trim() || null,
    }))
    .filter((row) => row.name);
}

// Resolve a customer's typed university reference (short code or full name,
// case- and spacing-insensitive) to an active university. Returns null when
// nothing matches — the caller never guesses.
export function matchActiveUniversity(
  value: string, universities: ActiveUniversity[],
): ActiveUniversity | null {
  const v = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (!v) return null;
  const exactCode = universities.find((u) => u.shortCode && u.shortCode.toLowerCase() === v);
  if (exactCode) return exactCode;
  const exactName = universities.find((u) => u.name.toLowerCase() === v);
  if (exactName) return exactName;
  return universities.find((u) => {
    const name = u.name.toLowerCase();
    return name.includes(v) || v.includes(name)
      || (u.shortCode ? v.includes(u.shortCode.toLowerCase()) : false);
  }) ?? null;
}

export type RouteRequestInput = {
  source: "whatsapp" | "web" | "admin";
  origin: string;
  destination: string;
  travellerType?: "student" | "general" | null;
  travelDate?: string | null;
  requestedByName?: string | null;
  requestedByPhone?: string | null;
  whatsappContactId?: string | null;
  note?: string | null;
};

// Log a corridor a customer asked for that we do not run yet. Never blocks the
// conversation — a failure here is swallowed by the caller.
export async function createRouteRequest(input: RouteRequestInput): Promise<{ id: string } | null> {
  const origin = input.origin.trim().slice(0, 120);
  const destination = input.destination.trim().slice(0, 120);
  if (!origin || !destination) return null;
  const result = await supabaseAdmin.from("route_requests").insert({
    source: input.source,
    origin,
    destination,
    traveller_type: input.travellerType ?? null,
    travel_date: input.travelDate ?? null,
    requested_by_name: input.requestedByName ?? null,
    requested_by_phone: input.requestedByPhone ?? null,
    whatsapp_contact_id: input.whatsappContactId ?? null,
    note: input.note ?? null,
  }).select("id").maybeSingle();
  if (result.error || !result.data) return null;
  return { id: String(result.data.id) };
}

export type CreateUnassignedBookingResult =
  | { outcome: "created" | "existing"; bookingId: string; expiresAt: string | null; fare: number; bookingFee: number; shortNotice: boolean }
  | { outcome: "rejected"; reason: string };

export async function createUnassignedWhatsAppBooking(
  conversation: WhatsAppConversationState, draft: BookingDraft, operationKey: string
): Promise<CreateUnassignedBookingResult> {
  if (!draft.routeId || !draft.travelDate || !draft.name) {
    return { outcome: "rejected", reason: "incomplete_booking" };
  }
  const route = await loadBookableRoute(draft.routeId);
  if (!route) return { outcome: "rejected", reason: "route_unavailable" };
  if (!route.priced) {
    // Never guess a fare. Surface the request so an agent can price the route
    // and follow up; no booking is created.
    console.warn("[whatsapp] unpriced route requested", {
      conversationId: conversation.conversationId, routeId: route.routeId,
      routeLabel: route.label, travelDate: draft.travelDate,
    });
    return { outcome: "rejected", reason: "route_unpriced" };
  }
  const bookingId = generateBookingId();
  const tripId = generateTripId(route.label, draft.travelDate);
  const result = await supabaseAdmin.rpc("create_route_booking_no_departure", {
    p_operation_key: operationKey, p_booking_id: bookingId, p_trip_id: tripId,
    p_route_id: route.routeId, p_travel_date: draft.travelDate,
    p_name: draft.name, p_phone: conversation.waId, p_email: draft.email || "",
    p_student_id: draft.studentId || "", p_destination: route.label,
    p_pickup: route.pickup, p_location: route.pickup, p_booking_type: "WhatsApp",
    p_whatsapp_contact_id: conversation.contactId, p_policy_version: WHATSAPP_POLICY_VERSION,
  });
  if (result.error) throw result.error;
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!row || row.outcome === "rejected") return { outcome: "rejected", reason: row?.reason || "booking_failed" };
  await supabaseAdmin.from("whatsapp_booking_operations").upsert({
    operation_key: operationKey, conversation_id: conversation.conversationId,
    booking_id: row.booking_id, status: "completed", updated_at: new Date().toISOString(),
  }, { onConflict: "operation_key" });
  const expiresAt: string | null = row.expires_at ?? null;
  const shortNotice = expiresAt ? Date.parse(expiresAt) - Date.now() < 30 * 60 * 1000 : false;
  return {
    outcome: row.outcome, bookingId: row.booking_id, expiresAt,
    fare: Number(row.fare) || route.fare, bookingFee: Number(row.booking_fee) || 0, shortNotice,
  };
}

export type UnassignedBookingRow = {
  bookingId: string; routeId: string | null; routeLabel: string; travelDate: string;
  name: string; phone: string; status: string; bookingFeeStatus: string; fareStatus: string;
  expiresAt: string | null; createdAt: string | null;
};

// Admin: WhatsApp bookings still awaiting a transport assignment, newest first,
// optionally narrowed to one route and/or requested date.
export async function listUnassignedWhatsAppBookings(
  filters: { routeId?: string; date?: string } = {}
): Promise<UnassignedBookingRow[]> {
  let query = supabaseAdmin.from("bookings")
    .select("booking_id,route_id,destination,travel_date,name,phone,status,booking_fee_status,fare_status,booking_expires_at,created_at")
    .eq("booking_source", "whatsapp").is("departure_id", null)
    .not("status", "in", "(Cancelled,Completed)")
    .order("created_at", { ascending: false }).limit(100);
  if (filters.routeId) query = query.eq("route_id", filters.routeId);
  if (filters.date) query = query.eq("travel_date", filters.date);
  const result = await query;
  if (result.error) throw result.error;
  return (result.data ?? []).map((row) => ({
    bookingId: String(row.booking_id), routeId: row.route_id ? String(row.route_id) : null,
    routeLabel: String(row.destination || "Trip"), travelDate: String(row.travel_date || ""),
    name: String(row.name || ""), phone: String(row.phone || ""),
    status: String(row.status || "Booked"), bookingFeeStatus: String(row.booking_fee_status || "unpaid"),
    fareStatus: String(row.fare_status || "unpaid"), expiresAt: row.booking_expires_at ?? null,
    createdAt: row.created_at ?? null,
  }));
}

// Published departures an unassigned booking could be linked to: same route,
// same requested date, with remaining capacity. The RPC re-checks all of this
// under row locks at assignment time.
export async function assignableDeparturesFor(bookingId: string): Promise<AvailableDeparture[]> {
  const booking = await supabaseAdmin.from("bookings")
    .select("route_id,travel_date,departure_id,booking_source")
    .eq("booking_id", bookingId).maybeSingle();
  if (booking.error || !booking.data) return [];
  if (booking.data.departure_id || booking.data.booking_source !== "whatsapp") return [];
  const routeId = booking.data.route_id ? String(booking.data.route_id) : "";
  const travelDate = String(booking.data.travel_date || "");
  if (!routeId || !travelDate) return [];
  const all = await findAvailableDepartures();
  return all.filter((departure) => departure.routeId === routeId && departure.travelDate === travelDate);
}

export type AssignTransportResult = { outcome: "assigned" | "rejected"; reason?: string };

export async function assignWhatsAppBookingTransport(
  bookingId: string, departureId: string, actorId: string | null
): Promise<AssignTransportResult> {
  const result = await supabaseAdmin.rpc("assign_whatsapp_booking", {
    p_booking_id: bookingId, p_departure_id: departureId, p_actor: actorId,
  });
  if (result.error) throw result.error;
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!row) return { outcome: "rejected", reason: "assignment_failed" };
  return row.outcome === "assigned"
    ? { outcome: "assigned" }
    : { outcome: "rejected", reason: row.reason || "assignment_failed" };
}
