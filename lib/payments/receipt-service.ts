import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeBookingRecord } from "@/lib/bookingServerUtils";
import { generateReceiptPdfBase64, type PaymentReceiptRecord } from "@/lib/receiptGenerator";
import { sendEmail } from "@/lib/resend";
import { logError } from "@/lib/logger";

export type ReceiptPaymentType = "booking_fee" | "transport_fare";

type PaymentRow = {
  id: string;
  booking_id: string;
  payment_type: ReceiptPaymentType;
  internal_reference: string;
  provider_reference: string | null;
  expected_amount: number;
  paid_amount: number | null;
  currency: string;
  payment_method: string | null;
  provider: string;
  paid_at: string | null;
  status: string;
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] || character);
}

async function buildReceipt(payment: PaymentRow): Promise<PaymentReceiptRecord | null> {
  const { data: bookingData, error } = await supabaseAdmin.from("bookings").select("*").eq("booking_id", payment.booking_id).maybeSingle();
  if (error || !bookingData) return null;

  const booking = normalizeBookingRecord(bookingData as Record<string, unknown>);
  const amount = Number(payment.paid_amount ?? payment.expected_amount);
  const paymentLabel = payment.payment_type === "booking_fee" ? "Booking Fee Paid" : "Transport Fare Paid";

  return {
    ...booking,
    receiptNumber: payment.internal_reference,
    paymentStatus: paymentLabel,
    paymentConfirmedAt:
      payment.paid_at || (payment.payment_type === "booking_fee" ? booking.bookingFeePaidAt : booking.farePaidAt || booking.fareCashCollectedAt),
    receiptPaymentType: payment.payment_type,
    receiptAmount: Number.isFinite(amount) ? amount : undefined,
    receiptCurrency: payment.currency,
    receiptPaymentMethod: payment.payment_method || payment.provider,
    receiptPaymentReference: payment.provider_reference || payment.internal_reference,
  };
}

export async function loadReceiptByTxRef(txRef: string): Promise<{ paymentId: string; receipt: PaymentReceiptRecord } | null> {
  const { data, error } = await supabaseAdmin
    .from("payments")
    .select("id, booking_id, payment_type, internal_reference, provider_reference, expected_amount, paid_amount, currency, payment_method, provider, paid_at, status")
    .eq("internal_reference", txRef)
    .eq("status", "paid")
    .maybeSingle();
  if (error || !data) return null;
  const receipt = await buildReceipt(data as PaymentRow);
  return receipt ? { paymentId: data.id as string, receipt } : null;
}

export async function loadLatestReceipt(bookingId: string, paymentType: ReceiptPaymentType): Promise<{ paymentId: string; receipt: PaymentReceiptRecord } | null> {
  const { data, error } = await supabaseAdmin
    .from("payments")
    .select("id, booking_id, payment_type, internal_reference, provider_reference, expected_amount, paid_amount, currency, payment_method, provider, paid_at, status")
    .eq("booking_id", bookingId)
    .eq("payment_type", paymentType)
    .eq("status", "paid")
    .order("paid_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  if (!data && paymentType === "transport_fare") {
    // Cash fares recorded before manual payments gained their own ledger row
    // still deserve a receipt. New manual settlements always use the RPC and
    // therefore take the normal, fully traceable branch below.
    const { data: bookingData } = await supabaseAdmin.from("bookings").select("*").eq("booking_id", bookingId).maybeSingle();
    if (!bookingData) return null;
    const booking = normalizeBookingRecord(bookingData as Record<string, unknown>);
    if (booking.fareStatus !== "paid" && booking.fareStatus !== "cash_collected") return null;
    const amount = (booking.fare || 0) * (booking.seats || 1);
    return {
      paymentId: bookingId,
      receipt: {
        ...booking,
        receiptNumber: `FARE-${bookingId}`,
        paymentStatus: "Transport Fare Paid",
        paymentConfirmedAt: booking.farePaidAt || booking.fareCashCollectedAt,
        receiptPaymentType: "transport_fare",
        receiptAmount: amount,
        receiptCurrency: "MWK",
        receiptPaymentMethod: booking.farePaymentMethod || "cash",
        receiptPaymentReference: `FARE-${bookingId}`,
      },
    };
  }
  if (!data) return null;
  const receipt = await buildReceipt(data as PaymentRow);
  return receipt ? { paymentId: data.id as string, receipt } : null;
}

export async function emailReceiptForPayment(txRef: string): Promise<"sent" | "already_sent" | "skipped" | "failed"> {
  const loaded = await loadReceiptByTxRef(txRef);
  if (!loaded) return "skipped";

  const email = loaded.receipt.email?.trim() || "";
  if (!email.includes("@")) return "skipped";

  const { data: claimed, error: claimError } = await supabaseAdmin.rpc("claim_payment_receipt_email", {
    p_payment_id: loaded.paymentId,
    p_recipient: email,
  });
  if (claimError) {
    logError("Unable to claim automatic receipt email", { paymentId: loaded.paymentId, error: claimError.message });
    return "failed";
  }
  if (!claimed) return "already_sent";

  const label = loaded.receipt.receiptPaymentType === "booking_fee" ? "Booking fee" : "Transport fare";
  const amount = loaded.receipt.receiptAmount ?? 0;
  const result = await sendEmail({
    to: email,
    subject: `${label} receipt - ${loaded.receipt.bookingId || "Travel With Hawkins"}`,
    html: `<div style="font-family:Arial,sans-serif;padding:16px"><h2 style="color:#1A0F00">Payment confirmed</h2><p>Hello ${escapeHtml(loaded.receipt.name || "Customer")},</p><p>Your ${label.toLowerCase()} payment has been confirmed. Your PDF receipt is attached.</p><p><b>Booking:</b> ${escapeHtml(loaded.receipt.bookingId || "N/A")}</p><p><b>Amount:</b> MWK ${amount.toLocaleString("en-MW")}</p><p><b>Reference:</b> ${escapeHtml(loaded.receipt.receiptPaymentReference || "N/A")}</p><hr><p style="font-size:12px;color:#666">Travel With Hawkins</p></div>`,
    attachments: [{ content: generateReceiptPdfBase64(loaded.receipt), filename: `${loaded.receipt.receiptNumber || "receipt"}.pdf`, content_type: "application/pdf" }],
  });

  await supabaseAdmin
    .from("payment_receipt_deliveries")
    .update(result.success ? { status: "sent", sent_at: new Date().toISOString(), error_message: null, updated_at: new Date().toISOString() } : { status: "failed", error_message: "Email provider rejected delivery", updated_at: new Date().toISOString() })
    .eq("payment_id", loaded.paymentId)
    .eq("channel", "email");

  if (result.success) {
    await supabaseAdmin.from("bookings").update({ receipt_sent: true }).eq("booking_id", loaded.receipt.bookingId);
    return "sent";
  }
  return "failed";
}
