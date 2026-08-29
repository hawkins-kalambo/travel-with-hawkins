import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { jsonError } from "@/lib/apiResponse";
import { requireWhatsAppAdmin } from "@/lib/whatsapp/admin";
import { normalizeWhatsAppId } from "@/lib/whatsapp/phone";
import { emailReceiptForPayment, loadReceiptByTxRef } from "@/lib/payments/receipt-service";
import { loadReceiptPdf } from "@/lib/payments/receipt-storage";
import { deliverWhatsAppReceipt } from "@/lib/whatsapp/receipt-delivery";

export const runtime = "nodejs";

// Confirm the payment belongs to a booking whose WhatsApp booker is the contact
// on THIS conversation — an id cannot be swapped to reach another customer's
// receipt.
async function bindPaymentToConversation(paymentId: string, conversationId: string) {
  const payment = await supabaseAdmin.from("payments")
    .select("id, booking_id, internal_reference, payment_type, status").eq("id", paymentId).maybeSingle();
  if (payment.error || !payment.data) return null;
  const booking = await supabaseAdmin.from("bookings").select("phone").eq("booking_id", payment.data.booking_id).maybeSingle();
  const waId = normalizeWhatsAppId(booking.data?.phone);
  if (!waId) return null;
  const contact = await supabaseAdmin.from("whatsapp_contacts").select("id").eq("wa_id", waId).maybeSingle();
  if (!contact.data) return null;
  const link = await supabaseAdmin.from("whatsapp_conversations").select("conversation_id").eq("contact_id", contact.data.id).maybeSingle();
  if (!link.data || link.data.conversation_id !== conversationId) return null;
  return payment.data;
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = await requireWhatsAppAdmin(req);
  if (!access.authorized) return jsonError(access.error, access.status);
  const { id } = await context.params;
  const paymentId = new URL(req.url).searchParams.get("paymentId")?.trim() || "";
  if (!paymentId) return jsonError("paymentId is required", 400);

  const payment = await bindPaymentToConversation(paymentId, id);
  if (!payment) return jsonError("Receipt not found for this conversation", 404);

  const loaded = await loadReceiptByTxRef(String(payment.internal_reference));
  const pdf = await loadReceiptPdf(paymentId, loaded?.receipt ?? null);
  if (!pdf) return jsonError("Receipt is not available yet", 404);
  return new NextResponse(Buffer.from(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${(loaded?.receipt.receiptNumber || "receipt").replace(/[^A-Za-z0-9._-]/g, "")}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

// Explicit admin resend, with an audit row. Guarded against a double-click by
// the atomic claim inside the deliverer (a concurrent resend sees 'sending').
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = await requireWhatsAppAdmin(req);
  if (!access.authorized) return jsonError(access.error, access.status);
  const { id } = await context.params;
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const paymentId = typeof body.paymentId === "string" ? body.paymentId.trim() : "";
  const channel = body.channel === "email" ? "email" : "whatsapp";
  if (!paymentId) return jsonError("paymentId is required", 400);

  const payment = await bindPaymentToConversation(paymentId, id);
  if (!payment) return jsonError("Receipt not found for this conversation", 404);
  if (payment.status !== "paid") return jsonError("Payment is not settled", 409);

  // Move a terminal row back to 'pending' so the deliverer's claim can pick it
  // up. A row currently 'sending' is left alone (409-safe inside the claim).
  await supabaseAdmin.from("payment_receipt_deliveries")
    .update({ status: "pending", error_message: null, updated_at: new Date().toISOString() })
    .eq("payment_id", paymentId).eq("channel", channel).in("status", ["sent", "failed", "blocked"]);

  const txRef = String(payment.internal_reference);
  const outcome = channel === "whatsapp" ? await deliverWhatsAppReceipt(txRef) : await emailReceiptForPayment(txRef);

  await supabaseAdmin.from("audit_logs").insert({
    actor_user_id: access.user.id, actor_role: access.role || "admin",
    action: "resend_payment_receipt", entity_type: "payment", entity_id: paymentId,
    previous_value: null, new_value: { channel, outcome },
    ip_address: req.headers.get("x-real-ip"), user_agent: req.headers.get("user-agent"),
    metadata: { conversation_id: id, booking_id: payment.booking_id, tx_ref: txRef },
  });

  if (outcome === "failed") return jsonError("The receipt could not be sent. It is queued for retry.", 502);
  return NextResponse.json({ success: true, outcome });
}
