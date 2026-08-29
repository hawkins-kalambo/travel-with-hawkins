import { NextResponse, type NextRequest } from "next/server";
import { jsonError } from "@/lib/apiResponse";
import { requireWhatsAppAdmin } from "@/lib/whatsapp/admin";
import {
  assignWhatsAppBookingTransport, assignableDeparturesFor, listUnassignedWhatsAppBookings,
} from "@/lib/whatsapp/domain";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Admin view of WhatsApp bookings that have no transport assigned yet
// (booking_source = 'whatsapp', departure_id IS NULL). See master plan §A.
export async function GET(req: NextRequest) {
  const access = await requireWhatsAppAdmin(req);
  if (!access.authorized) return jsonError(access.error, access.status);

  const url = new URL(req.url);
  const bookingId = url.searchParams.get("bookingId")?.trim() || "";
  if (bookingId) {
    // Candidate departures this specific booking could be assigned to.
    const departures = await assignableDeparturesFor(bookingId).catch(() => []);
    return NextResponse.json({ success: true, bookingId, departures });
  }

  const routeId = url.searchParams.get("routeId")?.trim() || undefined;
  const date = url.searchParams.get("date")?.trim() || undefined;
  if (date && !DATE.test(date)) return jsonError("date must be YYYY-MM-DD", 400);

  try {
    const bookings = await listUnassignedWhatsAppBookings({ routeId, date });
    return NextResponse.json({ success: true, bookings });
  } catch {
    return jsonError("Unable to load unassigned bookings", 500);
  }
}

// Assign transport: link an unassigned booking to a published route_departures
// row. The RPC validates route + date + published state + capacity under row
// locks and refuses if the booking is already assigned. Reference, payments and
// requested date are preserved.
export async function POST(req: NextRequest) {
  const access = await requireWhatsAppAdmin(req);
  if (!access.authorized) return jsonError(access.error, access.status);

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const bookingId = typeof body.bookingId === "string" ? body.bookingId.trim() : "";
  const departureId = typeof body.departureId === "string" ? body.departureId.trim() : "";
  if (!bookingId || !departureId) return jsonError("bookingId and departureId are required", 400);

  let result;
  try {
    result = await assignWhatsAppBookingTransport(bookingId, departureId, access.user.id);
  } catch {
    return jsonError("Unable to assign transport", 500);
  }
  if (result.outcome === "rejected") {
    const status = result.reason === "booking_not_found" || result.reason === "departure_not_found" ? 404
      : result.reason === "already_assigned" || result.reason === "insufficient_seats" ? 409
      : 400;
    return jsonError(assignRejectionMessage(result.reason), status);
  }
  return NextResponse.json({ success: true });
}

function assignRejectionMessage(reason?: string): string {
  switch (reason) {
    case "booking_not_found": return "That booking no longer exists";
    case "not_whatsapp_booking": return "Only WhatsApp bookings can be assigned here";
    case "already_assigned": return "That booking already has transport assigned";
    case "booking_not_active": return "That booking is cancelled or completed";
    case "departure_not_found": return "That departure no longer exists";
    case "departure_not_bookable": return "That departure is not published";
    case "route_mismatch": return "That departure is on a different route";
    case "date_mismatch": return "That departure is on a different date";
    case "insufficient_seats": return "That departure has no seats left";
    default: return "Unable to assign transport";
  }
}
