import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuthenticatedUser } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeBookingRecord } from "@/lib/bookingServerUtils";
import { sendEmail } from "@/lib/resend";
import { generateReceiptPdfBase64 } from "@/lib/receiptGenerator";
import { resolveRouteFareIfAvailable } from "@/lib/routePricing";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function getBookingId(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

export async function POST(request: NextRequest) {
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
    const bookingId = getBookingId((body as Record<string, unknown>).bookingId);

    if (!bookingId) {
      return jsonError("bookingId is required", 400);
    }

    const { data, error: fetchError } = await supabaseAdmin
      .from("bookings")
      .select("*")
      .eq("booking_id", bookingId)
      .maybeSingle();

    if (fetchError) {
      console.error("Failed to load booking for receipt send", fetchError);
      return jsonError("Unable to load booking", 500);
    }

    if (!data) {
      return jsonError("Booking not found", 404);
    }

    const booking = normalizeBookingRecord(data as Record<string, unknown>);
    const { data: settingsData } = await supabaseAdmin.from("settings").select("routes").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    const routesText = typeof settingsData?.routes === "string" ? settingsData.routes : "";
    const resolvedRouteFare = resolveRouteFareIfAvailable(booking.destination, routesText);
    const bookingWithFare = {
      ...booking,
      fare:
        typeof booking.fare === "number" && Number.isFinite(booking.fare) && booking.fare > 0
          ? booking.fare
          : resolvedRouteFare,
    };

    if (booking.paymentStatus !== "Payment Confirmed") {
      return jsonError("Receipt can only be sent after payment is confirmed", 400);
    }

    const customerEmail = typeof booking.email === "string" ? booking.email.trim() : "";
    if (!customerEmail || !customerEmail.includes("@")) {
      return jsonError("No customer email available.", 400);
    }

    const pdfBase64 = generateReceiptPdfBase64(bookingWithFare);

    const emailResult = await sendEmail({
      to: customerEmail,
      subject: `Your Travel with Hawkins Receipt - ${booking.bookingId}`,
      html: `
        <div style="font-family:Arial,sans-serif;padding:16px;">
          <h2 style="color:#1A0F00;">Your receipt is ready</h2>
          <p>Hi ${booking.name || "Customer"},</p>
          <p>Thank you for your payment. Your receipt is attached to this email.</p>
          <p><b>Receipt Number:</b> ${booking.receiptNumber || "N/A"}</p>
          <p><b>Trip ID:</b> ${booking.tripId || "N/A"}</p>
          <p><b>Fare:</b> ${bookingWithFare.fare != null ? `MWK ${bookingWithFare.fare.toLocaleString("en-MW")}` : "Pending"}</p>
          <p>If you have any questions, reply to this message or contact our support.</p>
          <hr />
          <p style="font-size:12px;color:#666;">Travel with Hawkins — Thank you for choosing us.</p>
        </div>
      `,
      attachments: [
        {
          content: pdfBase64,
          filename: `${booking.receiptNumber || booking.bookingId || "receipt"}.pdf`,
          content_type: "application/pdf",
        },
      ],
    });

    if (!emailResult.success) {
      console.error("Receipt email failed", emailResult.error);
      return jsonError("Failed to send receipt email", 500);
    }

    const { data: updatedBooking, error: updateError } = await supabaseAdmin
      .from("bookings")
      .update({ receipt_sent: true })
      .eq("booking_id", bookingId)
      .select()
      .single();

    if (updateError) {
      console.error("Failed to update receipt_sent", updateError);
      return jsonError("Failed to persist receipt status", 500);
    }

    return NextResponse.json({ success: true, booking: normalizeBookingRecord(updatedBooking as Record<string, unknown>) });
  } catch (error) {
    console.error("Send receipt route failed", error);
    return jsonError(error instanceof Error ? error.message : "Unknown error", 500);
  }
}
