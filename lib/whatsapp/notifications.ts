import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeWhatsAppId } from "@/lib/whatsapp/phone";
import { approvedTemplateNames } from "@/lib/whatsapp/admin";
import { deliverAndRecord } from "@/lib/whatsapp/repository";
import type { WhatsAppConversationState, WhatsAppLanguage } from "@/lib/whatsapp/types";

export async function notifyWhatsAppPaymentConfirmed(bookingId: string, paymentType: string): Promise<void> {
  const booking = await supabaseAdmin.from("bookings").select("booking_id,phone").eq("booking_id", bookingId).maybeSingle();
  const waId = normalizeWhatsAppId(booking.data?.phone);
  if (!waId) return;
  const contactResult = await supabaseAdmin.from("whatsapp_contacts").select("*").eq("wa_id", waId).maybeSingle();
  const contact = contactResult.data;
  if (!contact || contact.consent_status === "opted_out") return;
  const linkResult = await supabaseAdmin.from("whatsapp_conversations").select("*").eq("contact_id", contact.id).maybeSingle();
  const link = linkResult.data;
  if (!link) return;
  const conversation: WhatsAppConversationState = {
    conversationId: link.conversation_id, contactId: contact.id, waId,
    language: contact.language as WhatsAppLanguage, mode: link.mode, status: link.status,
    step: link.state_step, data: link.state_data || {}, version: Number(link.state_version),
    serviceWindowExpiresAt: contact.service_window_expires_at,
  };
  const label = paymentType === "booking_fee" ? "booking fee" : "transport fare";
  const insideWindow = contact.service_window_expires_at && new Date(contact.service_window_expires_at).getTime() > Date.now();
  if (insideWindow) {
    await deliverAndRecord(conversation, { type: "text", text: `Payment confirmed: the ${label} for booking ${bookingId} has been paid.` });
    return;
  }
  const name = "payment_confirmed";
  if (approvedTemplateNames().has(name)) {
    await deliverAndRecord(conversation, { type: "template", name, languageCode: contact.language === "ny" ? "ny" : "en", parameters: [bookingId, label] });
  }
}
