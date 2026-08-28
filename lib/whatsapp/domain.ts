import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { contactMatchesBooking, loadBookingById } from "@/lib/bookingAccess";
import { generateBookingId, generateTripId } from "@/lib/bookingServerUtils";
import { initiatePayChanguPayment } from "@/lib/payments/payment-service";
import { verifyAndFinalizePayment } from "@/lib/payments/finalize-flow";
import type { BookingDraft, WhatsAppConversationState } from "@/lib/whatsapp/types";

export type AvailableDeparture = {
  id: string; routeId: string; routeLabel: string; travelDate: string;
  departureTime?: string; fare: number; pickup: string; availableSeats: number;
};

function related(value: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(value)) return value[0] as Record<string, unknown> | undefined;
  return value && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

export async function findAvailableDepartures(origin?: string, departureId?: string): Promise<AvailableDeparture[]> {
  let routeQuery = supabaseAdmin.from("routes").select(
    "id, origin_district, destination_label, university_id, fare, status, direction, university:universities(name,status), pickupPoint:university_pickup_points(label,status), districtPickupPoint:district_pickup_points(label,status)"
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
  return departures.flatMap((departure): AvailableDeparture[] => {
    const route = routeMap.get(departure.route_id);
    if (!route) return [];
    const availableSeats = Number(departure.capacity) - (reserved.get(departure.id) || 0);
    if (availableSeats <= 0) return [];
    const university = related(route.university);
    const campus = related(route.pickupPoint);
    const district = related(route.districtPickupPoint);
    const destination = String(route.destination_label || university?.name || "").trim();
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

export type CreateWhatsAppBookingResult =
  | { outcome: "created" | "existing"; bookingId: string }
  | { outcome: "rejected"; reason: string };

export async function createWhatsAppBooking(
  conversation: WhatsAppConversationState, draft: BookingDraft, operationKey: string
): Promise<CreateWhatsAppBookingResult> {
  if (!draft.departureId || !draft.name || !draft.seats) return { outcome: "rejected", reason: "incomplete_booking" };
  const departure = await loadDeparture(draft.departureId);
  if (!departure) return { outcome: "rejected", reason: "departure_unavailable" };
  const bookingId = generateBookingId();
  const tripId = generateTripId(departure.routeLabel, departure.travelDate);
  const result = await supabaseAdmin.rpc("create_capacity_checked_booking", {
    p_operation_key: operationKey, p_booking_id: bookingId, p_trip_id: tripId,
    p_departure_id: departure.id, p_name: draft.name, p_phone: conversation.waId,
    p_email: draft.email || "", p_student_id: draft.studentId || "", p_seats: draft.seats,
    p_destination: departure.routeLabel, p_pickup: departure.pickup, p_location: departure.pickup,
    p_booking_type: "WhatsApp",
  });
  if (result.error) throw result.error;
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!row || row.outcome === "rejected") return { outcome: "rejected", reason: row?.reason || "booking_failed" };
  await supabaseAdmin.from("whatsapp_booking_operations").upsert({
    operation_key: operationKey, conversation_id: conversation.conversationId,
    booking_id: row.booking_id, status: "completed", updated_at: new Date().toISOString(),
  }, { onConflict: "operation_key" });
  return { outcome: row.outcome, bookingId: row.booking_id };
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
