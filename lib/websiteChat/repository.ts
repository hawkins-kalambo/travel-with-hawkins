import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { WebsiteChatConversationState, WebsiteChatMessage } from "@/lib/websiteChat/types";

export async function startConversation(input: { name: string; phone?: string; email?: string }): Promise<{
  sessionToken: string;
  conversation: WebsiteChatConversationState;
}> {
  const contactResult = await supabaseAdmin
    .from("website_chat_contacts")
    .insert({ name: input.name, phone: input.phone ?? null, email: input.email ?? null })
    .select("*")
    .single();
  if (contactResult.error || !contactResult.data) throw contactResult.error || new Error("contact_not_created");
  const contact = contactResult.data;

  const conversationResult = await supabaseAdmin
    .from("communication_conversations")
    .insert({ title: `Website chat — ${input.name}`, conversation_type: "support", created_by: null })
    .select("id")
    .single();
  if (conversationResult.error || !conversationResult.data) throw conversationResult.error || new Error("conversation_not_created");

  const linkResult = await supabaseAdmin
    .from("website_chat_conversations")
    .insert({ conversation_id: conversationResult.data.id, contact_id: contact.id })
    .select("*")
    .single();
  if (linkResult.error || !linkResult.data) throw linkResult.error || new Error("website_conversation_not_created");

  return {
    sessionToken: contact.session_token,
    conversation: {
      conversationId: linkResult.data.conversation_id,
      contactId: contact.id,
      name: contact.name,
      mode: linkResult.data.mode,
      status: linkResult.data.status,
    },
  };
}

export async function getConversationByToken(sessionToken: string): Promise<WebsiteChatConversationState | null> {
  const contactResult = await supabaseAdmin
    .from("website_chat_contacts")
    .select("id, name")
    .eq("session_token", sessionToken)
    .maybeSingle();
  if (contactResult.error || !contactResult.data) return null;

  const linkResult = await supabaseAdmin
    .from("website_chat_conversations")
    .select("conversation_id, mode, status")
    .eq("contact_id", contactResult.data.id)
    .maybeSingle();
  if (linkResult.error || !linkResult.data) return null;

  return {
    conversationId: linkResult.data.conversation_id,
    contactId: contactResult.data.id,
    name: contactResult.data.name,
    mode: linkResult.data.mode,
    status: linkResult.data.status,
  };
}

export async function getMessages(conversation: WebsiteChatConversationState): Promise<WebsiteChatMessage[]> {
  const { data, error } = await supabaseAdmin
    .from("communication_messages")
    .select("id, sender_id, website_sender_id, body, created_at")
    .eq("conversation_id", conversation.conversationId)
    .eq("channel", "website")
    .order("created_at", { ascending: true });
  if (error) throw error;

  const rows = data ?? [];
  const adminIds = Array.from(new Set(rows.map((row) => row.sender_id).filter((id): id is string => Boolean(id))));
  const adminNames = new Map<string, string>();
  if (adminIds.length) {
    const { data: profiles } = await supabaseAdmin.from("profiles").select("id, full_name").in("id", adminIds);
    for (const profile of profiles ?? []) adminNames.set(profile.id, profile.full_name || "Travel with Hawkins");
  }

  return rows.map((row) => {
    if (row.sender_id) {
      return { id: row.id, senderKind: "admin" as const, senderName: adminNames.get(row.sender_id) || "Travel with Hawkins", body: row.body, createdAt: row.created_at };
    }
    if (row.website_sender_id) {
      return { id: row.id, senderKind: "guest" as const, senderName: conversation.name, body: row.body, createdAt: row.created_at };
    }
    return { id: row.id, senderKind: "bot" as const, senderName: "Travel with Hawkins", body: row.body, createdAt: row.created_at };
  });
}

async function touchLastMessage(conversationId: string): Promise<void> {
  const now = new Date().toISOString();
  await supabaseAdmin.from("website_chat_conversations").update({ last_message_at: now, updated_at: now }).eq("conversation_id", conversationId);
  await supabaseAdmin.from("communication_conversations").update({ updated_at: now }).eq("id", conversationId);
}

export async function recordGuestMessage(conversation: WebsiteChatConversationState, body: string): Promise<WebsiteChatMessage> {
  const result = await supabaseAdmin
    .from("communication_messages")
    .insert({
      conversation_id: conversation.conversationId, sender_id: null, body, html: null, attachments: [],
      channel: "website", direction: "inbound", visibility: "customer", message_kind: "text",
      website_sender_id: conversation.contactId,
    })
    .select("id, created_at")
    .single();
  if (result.error || !result.data) throw result.error || new Error("guest_message_not_recorded");
  await touchLastMessage(conversation.conversationId);
  return { id: result.data.id, senderKind: "guest", senderName: conversation.name, body, createdAt: result.data.created_at };
}

export async function recordBotMessage(conversationId: string, body: string): Promise<WebsiteChatMessage> {
  const result = await supabaseAdmin
    .from("communication_messages")
    .insert({
      conversation_id: conversationId, sender_id: null, body, html: null, attachments: [],
      channel: "website", direction: "outbound", visibility: "customer", message_kind: "bot",
    })
    .select("id, created_at")
    .single();
  if (result.error || !result.data) throw result.error || new Error("bot_message_not_recorded");
  await touchLastMessage(conversationId);
  return { id: result.data.id, senderKind: "bot", senderName: "Travel with Hawkins", body, createdAt: result.data.created_at };
}

export async function requestHuman(conversation: WebsiteChatConversationState): Promise<WebsiteChatConversationState> {
  const result = await supabaseAdmin
    .from("website_chat_conversations")
    .update({ mode: "human", status: "waiting", assigned_to: null, updated_at: new Date().toISOString() })
    .eq("conversation_id", conversation.conversationId);
  if (result.error) throw result.error;
  return { ...conversation, mode: "human", status: "waiting" };
}
