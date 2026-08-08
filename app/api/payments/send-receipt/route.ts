import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmail } from "@/lib/resend";
import { generateReceiptPdfBase64 } from "@/lib/receiptGenerator";
import { loadLatestReceipt, type ReceiptPaymentType } from "@/lib/payments/receipt-service";
import { requireUniversityOperationsUser } from "@/lib/universityAdminAuth";

function error(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(request: NextRequest) {
  const authResponse = NextResponse.next();
  const auth = await requireUniversityOperationsUser(request, authResponse, "manageBookings");
  if (!auth.authorized) return error(auth.error, auth.status);
  const { user, role } = auth;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const bookingId = typeof body.bookingId === "string" ? body.bookingId.trim() : "";
  const paymentType = body.paymentType as ReceiptPaymentType;
  if (!bookingId || !["booking_fee", "transport_fare"].includes(paymentType)) return error("Valid bookingId and paymentType are required", 400);

  let bookingScopeQuery = supabaseAdmin.from("bookings").select("university_id, receipt_sent").eq("booking_id", bookingId);
  if (!auth.isGlobal) bookingScopeQuery = bookingScopeQuery.in("university_id", auth.universityIds);
  const { data: scopedBooking, error: scopeError } = await bookingScopeQuery.maybeSingle();
  if (scopeError) return error("Unable to verify booking access", 500);
  if (!scopedBooking) return error("Booking not found", 404);

  const loaded = await loadLatestReceipt(bookingId, paymentType);
  if (!loaded) return error("Paid payment record not found", 404);
  const email = loaded.receipt.email?.trim() || "";
  if (!email.includes("@")) return error("No customer email available", 400);

  const label = paymentType === "booking_fee" ? "Booking fee" : "Transport fare";
  const result = await sendEmail({
    to: email,
    subject: `${label} receipt - ${bookingId}`,
    html: `<div style="font-family:Arial,sans-serif;padding:16px"><h2>Your payment receipt</h2><p>Your ${label.toLowerCase()} receipt is attached.</p><p><b>Booking:</b> ${bookingId}</p><p><b>Amount:</b> MWK ${(loaded.receipt.receiptAmount || 0).toLocaleString("en-MW")}</p></div>`,
    attachments: [{ content: generateReceiptPdfBase64(loaded.receipt), filename: `${loaded.receipt.receiptNumber || "receipt"}.pdf`, content_type: "application/pdf" }],
  });
  if (!result.success) return error("Failed to send receipt email", 502);

  const previous = { receipt_sent: scopedBooking.receipt_sent };
  let receiptUpdate = supabaseAdmin.from("bookings").update({ receipt_sent: true }).eq("booking_id", bookingId);
  if (!auth.isGlobal) receiptUpdate = receiptUpdate.in("university_id", auth.universityIds);
  await receiptUpdate;
  await supabaseAdmin.from("audit_logs").insert({
    actor_user_id: user.id, actor_role: role, action: "send_payment_receipt", entity_type: "payment", entity_id: loaded.paymentId,
    previous_value: previous, new_value: { receipt_sent: true }, ip_address: request.headers.get("x-real-ip"), user_agent: request.headers.get("user-agent"),
    metadata: { booking_id: bookingId, payment_type: paymentType, recipient: email },
    university_id: scopedBooking.university_id ?? null,
  });
  return NextResponse.json({ success: true });
}
