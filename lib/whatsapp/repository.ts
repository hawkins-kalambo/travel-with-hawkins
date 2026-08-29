import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendWhatsAppMessage } from "@/lib/whatsapp/client";
import { messageText } from "@/lib/whatsapp/messages";
import type { WhatsAppConversationState, WhatsAppInboundMessage, WhatsAppLanguage, WhatsAppOutboundMessage, WhatsAppParsedEvent, WhatsAppStateData } from "@/lib/whatsapp/types";
import { toStoredEventData, webhookEventKey } from "@/lib/whatsapp/parser";
import { notifyAdminOfWhatsAppHandoff } from "@/lib/whatsapp/agent-alerts";

type StoredEvent = { id: string; processing_status: string };

export async function storeWebhookEvent(event: WhatsAppParsedEvent): Promise<StoredEvent | null> {
  const row = {
    idempotency_key: webhookEventKey(event), provider_message_id: event.id,
    event_kind: event.kind, event_data: toStoredEventData(event),
  };
  const inserted = await supabaseAdmin.from("whatsapp_webhook_events")
    .upsert(row, { onConflict: "idempotency_key", ignoreDuplicates: true }).select("id, processing_status");
  if (inserted.error) throw inserted.error;
  if (inserted.data?.[0]) return inserted.data[0] as StoredEvent;
  const existing = await supabaseAdmin.from("whatsapp_webhook_events")
    .select("id, processing_status").eq("idempotency_key", row.idempotency_key).maybeSingle();
  if (existing.error) throw existing.error;
  return existing.data as StoredEvent | null;
}

export async function claimWebhookEvent(eventId: string): Promise<{ eventId: string; correlationId: string; event: WhatsAppParsedEvent } | null> {
  const result = await supabaseAdmin.rpc("claim_whatsapp_webhook_event", { p_event_id: eventId });
  if (result.error) throw result.error;
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!row) return null;
  return { eventId: row.event_id, correlationId: row.correlation_id, event: row.event_data as WhatsAppParsedEvent };
}

export async function finishWebhookEvent(eventId: string): Promise<void> {
  const result = await supabaseAdmin.from("whatsapp_webhook_events").update({
    processing_status: "processed", processed_at: new Date().toISOString(),
    processing_started_at: null, last_error_code: null,
    // Remove duplicated message content after the transcript has been saved.
    event_data: { processed: true }, updated_at: new Date().toISOString(),
  }).eq("id", eventId);
  if (result.error) throw result.error;
}

export async function failWebhookEvent(eventId: string, code: string): Promise<void> {
  await supabaseAdmin.from("whatsapp_webhook_events").update({
    processing_status: "failed", processed_at: null, processing_started_at: null,
    last_error_code: code.slice(0, 120), updated_at: new Date().toISOString(),
  }).eq("id", eventId);
}

export async function ensureConversation(message: WhatsAppInboundMessage): Promise<WhatsAppConversationState & { optedOut: boolean }> {
  const now = new Date();
  const windowExpires = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const contactResult = await supabaseAdmin.from("whatsapp_contacts").upsert({
    wa_id: message.from, display_name: message.displayName ?? null,
    last_inbound_at: now.toISOString(), service_window_expires_at: windowExpires,
    updated_at: now.toISOString(),
  }, { onConflict: "wa_id" }).select("*").single();
  if (contactResult.error || !contactResult.data) throw contactResult.error || new Error("contact_not_created");
  const contact = contactResult.data;

  let linkResult = await supabaseAdmin.from("whatsapp_conversations")
    .select("*, communication_conversations(id)").eq("contact_id", contact.id).maybeSingle();
  if (linkResult.error) throw linkResult.error;
  if (!linkResult.data) {
    const conversation = await supabaseAdmin.from("communication_conversations").insert({
      title: `WhatsApp support ${message.from.slice(-4)}`, conversation_type: "whatsapp", created_by: null,
    }).select("id").single();
    if (conversation.error || !conversation.data) throw conversation.error || new Error("conversation_not_created");
    linkResult = await supabaseAdmin.from("whatsapp_conversations").insert({
      conversation_id: conversation.data.id, contact_id: contact.id,
    }).select("*").single();
    if (linkResult.error) throw linkResult.error;
  }
  const link = linkResult.data!;
  return {
    conversationId: link.conversation_id, contactId: contact.id, waId: contact.wa_id,
    language: contact.language as WhatsAppLanguage, mode: link.mode, status: link.status,
    step: link.state_step, data: (link.state_data || {}) as WhatsAppStateData,
    version: Number(link.state_version) || 0, serviceWindowExpiresAt: contact.service_window_expires_at,
    stateExpiresAt: link.state_expires_at ?? null,
    optedOut: contact.consent_status === "opted_out",
  };
}

export async function recordInbound(conversation: WhatsAppConversationState, message: WhatsAppInboundMessage): Promise<void> {
  const result = await supabaseAdmin.from("communication_messages").insert({
    conversation_id: conversation.conversationId, sender_id: null, body: message.text || `[${message.inputType}]`,
    html: null, attachments: [], channel: "whatsapp", direction: "inbound", visibility: "customer",
    message_kind: message.inputType, external_sender_id: conversation.contactId,
    provider_message_id: message.id, provider_status: "received", provider_metadata: {},
  });
  if (result.error && result.error.code !== "23505") throw result.error;
  // Bump the list-view preview + unread badge in one guarded RPC (unread only
  // accrues while a human is involved — see the migration).
  await supabaseAdmin.rpc("bump_whatsapp_unread", {
    p_conversation_id: conversation.conversationId,
    p_preview: message.text || `[${message.inputType}]`,
  });
}

// `origin` attributes the transcript line: "agent" (a human sent it),
// "bot" (the automated flow), or "automatic" (an unattended system message
// such as a payment receipt). Defaults from whether a senderId was given.
export type WhatsAppSendOrigin = "agent" | "bot" | "automatic";

export async function deliverAndRecord(
  conversation: WhatsAppConversationState, message: WhatsAppOutboundMessage,
  senderId: string | null = null, origin?: WhatsAppSendOrigin,
): Promise<string> {
  const resolvedOrigin: WhatsAppSendOrigin = origin ?? (senderId ? "agent" : "bot");
  const preview = messageText(message);
  const pending = await supabaseAdmin.from("communication_messages").insert({
    conversation_id: conversation.conversationId, sender_id: senderId, body: preview, html: null,
    attachments: [], channel: "whatsapp", direction: "outbound", visibility: "customer",
    message_kind: message.type, provider_status: "sending",
    template_name: message.type === "template" ? message.name : null,
    provider_metadata: { origin: resolvedOrigin },
  }).select("id").single();
  if (pending.error || !pending.data) throw pending.error || new Error("outbound_record_failed");
  try {
    const providerId = await sendWhatsAppMessage(conversation.waId, message);
    await supabaseAdmin.from("communication_messages").update({ provider_message_id: providerId, provider_status: "sent" }).eq("id", pending.data.id);
    await supabaseAdmin.rpc("touch_whatsapp_last_message", {
      p_conversation_id: conversation.conversationId, p_preview: preview,
    });
    return providerId;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "send_failed";
    await supabaseAdmin.from("communication_messages").update({ provider_status: "failed", provider_error_code: code.slice(0, 80) }).eq("id", pending.data.id);
    throw error;
  }
}

// Media send. Distinct from deliverAndRecord because the caller needs the
// transcript message id (to link a whatsapp_media / receipt-delivery row) and
// the message carries an `attachments` descriptor the inbox renders as a card.
// `origin` defaults to "agent" (attachments come from a human) but an
// automatic receipt passes "automatic" with a null senderId.
export async function deliverAttachmentAndRecord(
  conversation: WhatsAppConversationState,
  message: Extract<WhatsAppOutboundMessage, { type: "document" | "image" }>,
  senderId: string | null, attachments: unknown[], origin: WhatsAppSendOrigin = "agent",
): Promise<{ providerMessageId: string; messageId: string }> {
  const preview = messageText(message);
  const pending = await supabaseAdmin.from("communication_messages").insert({
    conversation_id: conversation.conversationId, sender_id: senderId, body: preview, html: null,
    attachments, channel: "whatsapp", direction: "outbound", visibility: "customer",
    message_kind: message.type, provider_status: "sending",
    provider_metadata: { origin },
  }).select("id").single();
  if (pending.error || !pending.data) throw pending.error || new Error("outbound_record_failed");
  const messageId = pending.data.id as string;
  try {
    const providerMessageId = await sendWhatsAppMessage(conversation.waId, message);
    await supabaseAdmin.from("communication_messages").update({ provider_message_id: providerMessageId, provider_status: "sent" }).eq("id", messageId);
    await supabaseAdmin.rpc("touch_whatsapp_last_message", { p_conversation_id: conversation.conversationId, p_preview: preview });
    return { providerMessageId, messageId };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "send_failed";
    await supabaseAdmin.from("communication_messages").update({ provider_status: "failed", provider_error_code: code.slice(0, 80) }).eq("id", messageId);
    throw error;
  }
}

export async function transitionState(conversation: WhatsAppConversationState, step: string, data: WhatsAppStateData): Promise<WhatsAppConversationState> {
  const expiry = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const result = await supabaseAdmin.rpc("transition_whatsapp_state", {
    p_conversation_id: conversation.conversationId, p_expected_version: conversation.version,
    p_step: step, p_state_data: data, p_expires_at: expiry,
  });
  if (result.error) throw result.error;
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!row) throw new Error("conversation_state_conflict");
  return { ...conversation, step: step as WhatsAppConversationState["step"], data, version: Number(row.state_version) };
}

export async function setLanguage(conversation: WhatsAppConversationState, language: WhatsAppLanguage): Promise<WhatsAppConversationState> {
  const result = await supabaseAdmin.from("whatsapp_contacts").update({ language, updated_at: new Date().toISOString() }).eq("id", conversation.contactId);
  if (result.error) throw result.error;
  return { ...conversation, language };
}

export async function setOptOut(conversation: WhatsAppConversationState, optedOut: boolean): Promise<void> {
  const result = await supabaseAdmin.from("whatsapp_contacts").update({
    consent_status: optedOut ? "opted_out" : "implicit_service",
    opted_out_at: optedOut ? new Date().toISOString() : null,
    consent_recorded_at: new Date().toISOString(), consent_source: "whatsapp_keyword",
  }).eq("id", conversation.contactId);
  if (result.error) throw result.error;
}

export async function requestHuman(conversation: WhatsAppConversationState): Promise<WhatsAppConversationState> {
  // Alert the on-call admin only on a genuine new request for a human — not
  // when the conversation is already waiting, or an agent already holds it.
  const isNewRequest = conversation.status === "bot_controlled" || conversation.status === "resolved";
  const result = await supabaseAdmin.from("whatsapp_conversations").update({
    mode: "human", status: "waiting", assigned_to: null, updated_at: new Date().toISOString(),
  }).eq("conversation_id", conversation.conversationId);
  if (result.error) throw result.error;
  if (isNewRequest) {
    // Fail-soft: an SMS/email problem must never break the handoff itself.
    try { await notifyAdminOfWhatsAppHandoff(conversation); } catch { /* logged inside */ }
  }
  return { ...conversation, mode: "human", status: "waiting", step: "agent_waiting" };
}

export async function updateDeliveryStatus(event: Extract<WhatsAppParsedEvent, { kind: "status" }>): Promise<void> {
  const result = await supabaseAdmin.from("communication_messages").update({
    provider_status: event.status, provider_error_code: event.errorCode ?? null,
  }).eq("provider_message_id", event.id);
  if (result.error) throw result.error;
}
