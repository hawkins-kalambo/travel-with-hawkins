import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { logError, logWarn } from "@/lib/logger";
import { normalizeWhatsAppId } from "@/lib/whatsapp/phone";
import { deliverAttachmentAndRecord } from "@/lib/whatsapp/repository";
import { uploadWhatsAppMedia, MetaWhatsAppError } from "@/lib/whatsapp/client";
import { notifyWhatsAppPaymentConfirmed } from "@/lib/whatsapp/notifications";
import { loadReceiptByTxRef } from "@/lib/payments/receipt-service";
import { getOrCreateReceiptPdf } from "@/lib/payments/receipt-storage";
import type { WhatsAppConversationState, WhatsAppLanguage } from "@/lib/whatsapp/types";

export type WhatsAppReceiptOutcome = "sent" | "already_sent" | "blocked" | "skipped" | "failed";

type ResolvedTarget = {
  conversation: WhatsAppConversationState;
  waId: string;
  departureAssigned: boolean;
};

// The receipt goes to the booking's authorised WhatsApp booker — the number on
// the booking, not the payer or the passenger — and only if that contact has
// not opted out.
async function resolveTarget(bookingId: string): Promise<ResolvedTarget | null> {
  const booking = await supabaseAdmin.from("bookings")
    .select("phone,departure_id").eq("booking_id", bookingId).maybeSingle();
  const waId = normalizeWhatsAppId(booking.data?.phone);
  if (!waId) return null;
  const contact = await supabaseAdmin.from("whatsapp_contacts").select("*").eq("wa_id", waId).maybeSingle();
  if (!contact.data || contact.data.consent_status === "opted_out") return null;
  const link = await supabaseAdmin.from("whatsapp_conversations").select("*").eq("contact_id", contact.data.id).maybeSingle();
  if (!link.data) return null;
  return {
    waId,
    departureAssigned: Boolean(booking.data?.departure_id),
    conversation: {
      conversationId: link.data.conversation_id, contactId: contact.data.id, waId,
      language: contact.data.language as WhatsAppLanguage, mode: link.data.mode, status: link.data.status,
      step: link.data.state_step, data: link.data.state_data || {}, version: Number(link.data.state_version),
      serviceWindowExpiresAt: contact.data.service_window_expires_at,
    },
  };
}

function mwk(amount: number, currency: string): string {
  return `${currency || "MWK"} ${Math.round(amount).toLocaleString("en-MW")}`;
}

function buildCaption(receipt: Awaited<ReturnType<typeof loadReceiptByTxRef>>, departureAssigned: boolean): string {
  const r = receipt!.receipt;
  const isFee = r.receiptPaymentType === "booking_fee";
  const label = isFee ? "Booking-fee payment" : "Transport-fare payment";
  const amount = mwk(Number(r.receiptAmount) || 0, r.receiptCurrency || "MWK");
  const feeOutstanding = r.bookingFeeStatus !== "paid" ? Number(r.bookingFeeAmount) || 0 : 0;
  const fareOutstanding = r.fareStatus !== "paid" && r.fareStatus !== "cash_collected"
    ? (Number(r.fare) || 0) * (Number(r.seats) || 1) : 0;
  const balance = feeOutstanding + fareOutstanding;
  const lines = [
    `Receipt ${r.receiptNumber}`,
    `${label} received for booking ${r.bookingId}.`,
    `Amount: ${amount}.`,
    balance > 0 ? `Balance still due: ${mwk(balance, r.receiptCurrency || "MWK")}.` : "No balance outstanding.",
  ];
  if (isFee) lines.push("This is a booking-fee receipt — the transport fare is separate.");
  if (!departureAssigned) lines.push("Transport for your travel date is arranged separately.");
  lines.push("This confirms your payment was received. It is not a boarding ticket.");
  return lines.join("\n");
}

async function markDelivery(paymentId: string, fields: Record<string, unknown>): Promise<void> {
  await supabaseAdmin.from("payment_receipt_deliveries")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("payment_id", paymentId).eq("channel", "whatsapp");
}

// Deliver the canonical PDF receipt to the booking's WhatsApp booker. Idempotent
// via claim_payment_receipt_delivery. Never throws past this boundary — a PDF or
// WhatsApp failure must not undo a finalised payment; the outbox row is left in
// a state the re-drive / an admin can act on.
export async function deliverWhatsAppReceipt(txRef: string): Promise<WhatsAppReceiptOutcome> {
  const trimmed = txRef.trim();
  if (!trimmed) return "skipped";

  let loaded: Awaited<ReturnType<typeof loadReceiptByTxRef>>;
  try {
    loaded = await loadReceiptByTxRef(trimmed);
  } catch (error) {
    logError("Receipt lookup failed for WhatsApp delivery", { txRef: trimmed, error: error instanceof Error ? error.message : "unknown" });
    return "failed";
  }
  if (!loaded) return "skipped";

  const target = await resolveTarget(loaded.receipt.bookingId || "");
  if (!target) return "skipped";

  const claim = await supabaseAdmin.rpc("claim_payment_receipt_delivery", {
    p_payment_id: loaded.paymentId, p_channel: "whatsapp", p_recipient: target.waId,
  });
  if (claim.error) {
    logError("Unable to claim WhatsApp receipt delivery", { paymentId: loaded.paymentId, error: claim.error.message });
    return "failed";
  }
  if (!claim.data) return "already_sent";

  // §6 — the customer-service window governs media at actual send time. Outside
  // it, a document-header template would be required; none is enabled, so keep
  // the receipt for admin download, record the blocked state, and fall back to
  // the lightweight approved confirmation template if there is one.
  const insideWindow = target.conversation.serviceWindowExpiresAt
    && new Date(target.conversation.serviceWindowExpiresAt).getTime() > Date.now();
  if (!insideWindow) {
    await markDelivery(loaded.paymentId, { status: "blocked", error_message: "outside_window" });
    try {
      await notifyWhatsAppPaymentConfirmed(loaded.receipt.bookingId || "", loaded.receipt.receiptPaymentType || "booking_fee");
    } catch { /* best-effort confirmation only */ }
    return "blocked";
  }

  let bytes: Uint8Array;
  try {
    bytes = await getOrCreateReceiptPdf(loaded.paymentId, loaded.receipt);
  } catch (error) {
    await markDelivery(loaded.paymentId, { status: "failed", error_message: "pdf_generation_failed" });
    logError("Receipt PDF generation failed", { paymentId: loaded.paymentId, error: error instanceof Error ? error.message : "unknown" });
    return "failed";
  }

  const fileName = `${loaded.receipt.receiptNumber || "receipt"}.pdf`.replace(/[^A-Za-z0-9._ -]/g, "");
  let providerMediaId: string;
  try {
    providerMediaId = await uploadWhatsAppMedia(bytes, "application/pdf", fileName);
  } catch (error) {
    const ambiguous = error instanceof MetaWhatsAppError && error.code === "timeout";
    await markDelivery(loaded.paymentId, {
      status: ambiguous ? "sending" : "failed",
      error_message: ambiguous ? "ambiguous_timeout_on_upload" : "media_upload_failed",
    });
    logWarn("Receipt media upload failed", { paymentId: loaded.paymentId, ambiguous });
    return "failed";
  }

  const caption = buildCaption(loaded, target.departureAssigned);
  try {
    const sent = await deliverAttachmentAndRecord(
      target.conversation,
      { type: "document", mediaId: providerMediaId, filename: fileName, caption },
      null,
      [{ receiptFor: loaded.paymentId, kind: "receipt", fileName }],
      "automatic",
    );
    await markDelivery(loaded.paymentId, {
      status: "sent", sent_at: new Date().toISOString(), error_message: null,
      provider_message_id: sent.providerMessageId, storage_path: `${loaded.paymentId}.pdf`,
    });
    await supabaseAdmin.from("bookings").update({ receipt_sent: true }).eq("booking_id", loaded.receipt.bookingId);
    return "sent";
  } catch (error) {
    const ambiguous = error instanceof MetaWhatsAppError && error.code === "timeout";
    await markDelivery(loaded.paymentId, {
      status: ambiguous ? "sending" : "failed",
      error_message: ambiguous ? "ambiguous_timeout_on_send" : "send_failed",
    });
    logWarn("Receipt document send failed", { paymentId: loaded.paymentId, ambiguous });
    return "failed";
  }
}
