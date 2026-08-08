import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeBookingRecord } from "@/lib/bookingServerUtils";
import { logError } from "@/lib/logger";
import { requireUniversityOperationsUser } from "@/lib/universityAdminAuth";

const METHODS = new Set(["cash", "bank_transfer", "manual_adjustment"]);

export async function POST(request: NextRequest) {
  const authResponse = NextResponse.next();
  const auth = await requireUniversityOperationsUser(request, authResponse, "confirmCash");
  if (!auth.authorized) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  const { user, role } = auth;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const bookingId = typeof body.bookingId === "string" ? body.bookingId.trim() : "";
  const paymentMethod = typeof body.paymentMethod === "string" ? body.paymentMethod.trim() : "";
  const reference = typeof body.reference === "string" ? body.reference.trim().slice(0, 200) : "";
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 1000) : "";
  if (!bookingId || !METHODS.has(paymentMethod)) return NextResponse.json({ success: false, error: "Booking and valid payment method are required" }, { status: 400 });
  if (paymentMethod === "bank_transfer" && !reference) return NextResponse.json({ success: false, error: "Bank transfer reference is required" }, { status: 400 });
  if (!auth.isGlobal && paymentMethod === "manual_adjustment") {
    return NextResponse.json({ success: false, error: "Manual adjustments require a global administrator" }, { status: 403 });
  }

  let bookingScopeQuery = supabaseAdmin.from("bookings").select("*").eq("booking_id", bookingId);
  if (!auth.isGlobal) bookingScopeQuery = bookingScopeQuery.in("university_id", auth.universityIds);
  const { data: existingBooking, error: bookingScopeError } = await bookingScopeQuery.maybeSingle();
  if (bookingScopeError) return NextResponse.json({ success: false, error: "Unable to verify booking access" }, { status: 500 });
  if (!existingBooking) return NextResponse.json({ success: false, error: "Booking not found" }, { status: 404 });

  const internalReference = `MANUAL-FARE-${randomUUID()}`;
  const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc("record_manual_fare_payment", {
    p_booking_id: bookingId,
    p_actor_user_id: user.id,
    p_payment_method: paymentMethod,
    p_internal_reference: internalReference,
    p_provider_reference: reference || null,
    p_notes: notes || null,
  });
  if (rpcError) {
    logError("Manual fare recording failed", { bookingId, error: rpcError.message });
    return NextResponse.json({ success: false, error: rpcError.message }, { status: 409 });
  }

  const { data: bookingData } = await supabaseAdmin.from("bookings").select("*").eq("booking_id", bookingId).single();
  await supabaseAdmin.from("audit_logs").insert({
    actor_user_id: user.id, actor_role: role, action: "record_manual_fare_payment", entity_type: "booking", entity_id: bookingId,
    new_value: bookingData, ip_address: request.headers.get("x-real-ip"), user_agent: request.headers.get("user-agent"),
    metadata: { payment_method: paymentMethod, reference: reference || null, notes: notes || null, payment: Array.isArray(rpcData) ? rpcData[0] : rpcData },
    university_id: existingBooking.university_id ?? null,
  });

  return NextResponse.json({ success: true, booking: bookingData ? normalizeBookingRecord(bookingData as Record<string, unknown>) : null });
}
