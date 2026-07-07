import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuthenticatedUser } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeBookingRecord } from "@/lib/bookingServerUtils";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function getBookingId(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

export async function GET(request: NextRequest) {
  const response = NextResponse.next();
  const { user, error } = await requireAuthenticatedUser(request, response);

  if (error || !user) {
    return jsonError("Authentication required", 401);
  }

  const allowedAdminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || process.env.ADMIN_EMAIL;
  const userEmail = typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
  const normalizedAllowed = typeof allowedAdminEmail === "string" ? allowedAdminEmail.trim().toLowerCase() : "";

  if (normalizedAllowed && userEmail && userEmail !== normalizedAllowed) {
    return jsonError("Admin access required", 403);
  }

  try {
    const { data, error: fetchError } = await supabaseAdmin
      .from("bookings")
      .select("*")
      .order("created_at", { ascending: false });

    if (fetchError) {
      console.error("Failed to load admin bookings", fetchError);
      return jsonError("Unable to load bookings", 500);
    }

    const bookings = (data ?? []).map((row) => normalizeBookingRecord(row as Record<string, unknown>));

    return NextResponse.json({ success: true, bookings });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unknown error");
  }
}

export async function PATCH(request: NextRequest) {
  const response = NextResponse.next();
  const { user, error } = await requireAuthenticatedUser(request, response);

  if (error || !user) {
    return jsonError("Authentication required", 401);
  }

  const allowedAdminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || process.env.ADMIN_EMAIL;
  const userEmail = typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
  const normalizedAllowed = typeof allowedAdminEmail === "string" ? allowedAdminEmail.trim().toLowerCase() : "";

  if (normalizedAllowed && userEmail && userEmail !== normalizedAllowed) {
    return jsonError("Admin access required", 403);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const payload = body as Record<string, unknown>;
    const bookingId = getBookingId(payload.bookingId);
    const tripId = getBookingId(payload.tripId);
    const status = typeof payload.status === "string" ? payload.status : undefined;
    const paymentStatus = typeof payload.paymentStatus === "string" ? payload.paymentStatus : undefined;
    const paymentNotes = typeof payload.paymentNotes === "string" ? payload.paymentNotes : undefined;

    if (!bookingId && !tripId) {
      return jsonError("bookingId or tripId is required", 400);
    }

    const updatePayload: Record<string, unknown> = {};
    if (status) updatePayload.status = status;
    if (paymentStatus) updatePayload.payment_status = paymentStatus;
    if (paymentNotes !== undefined) updatePayload.payment_notes = paymentNotes;

    if (Object.keys(updatePayload).length === 0) {
      return jsonError("No update fields provided", 400);
    }

    let query = supabaseAdmin.from("bookings").update(updatePayload);
    if (bookingId) query = query.eq("booking_id", bookingId);
    else query = query.eq("trip_id", tripId);

    const { data, error: updateError } = await query.select().maybeSingle();
    if (updateError) {
      console.error("Admin booking update failed", updateError);
      return jsonError("Unable to update booking", 500);
    }

    const record = normalizeBookingRecord((data as Record<string, unknown>) ?? {});
    return NextResponse.json({ success: true, booking: record, message: "Booking updated" });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unknown error");
  }
}

export async function DELETE(request: NextRequest) {
  const response = NextResponse.next();
  const { user, error } = await requireAuthenticatedUser(request, response);

  if (error || !user) {
    return jsonError("Authentication required", 401);
  }

  const allowedAdminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || process.env.ADMIN_EMAIL;
  const userEmail = typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
  const normalizedAllowed = typeof allowedAdminEmail === "string" ? allowedAdminEmail.trim().toLowerCase() : "";

  if (normalizedAllowed && userEmail && userEmail !== normalizedAllowed) {
    return jsonError("Admin access required", 403);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const payload = body as Record<string, unknown>;
    const bookingId = getBookingId(payload.bookingId ?? payload.id);

    if (!bookingId) {
      return jsonError("bookingId is required", 400);
    }

    const { error: deleteError } = await supabaseAdmin.from("bookings").delete().eq("booking_id", bookingId);
    if (deleteError) {
      console.error("Admin booking delete failed", deleteError);
      return jsonError("Unable to delete booking", 500);
    }

    return NextResponse.json({ success: true, message: "Booking deleted" });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unknown error");
  }
}
