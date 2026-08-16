import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { logError } from "@/lib/logger";
import type { AgentPresence, WebsiteChatConversationState, WebsiteChatMessage } from "@/lib/websiteChat/types";

// "Online" tolerates one missed 10s admin heartbeat (see the admin inbox's
// heartbeat interval) before flipping to "last seen"; "typing" clears itself
// quickly since the admin side also sends an explicit typing:false the
// moment they pause, so this window only covers a dropped request.
const AGENT_ONLINE_THRESHOLD_MS = 25_000;
const AGENT_TYPING_THRESHOLD_MS = 6_000;

export async function startConversation(input: { name: string; phone?: string; email?: string; customerId?: string }): Promise<{
  sessionToken: string;
  conversation: WebsiteChatConversationState;
}> {
  const contactResult = await supabaseAdmin
    .from("website_chat_contacts")
    .insert({ name: input.name, phone: input.phone ?? null, email: input.email ?? null, customer_id: input.customerId ?? null })
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

// user_metadata.role === "customer" is only ever set for password signups
// (see registerCustomer in lib/customerAuthAdmin.ts) -- Google OAuth never
// sets it, which silently broke customer_id-based conversation resolution
// for every Google-signed-in customer (same root cause as the SiteHeader
// "always shows Sign In" bug). Checking for a real customer_profiles row is
// reliable for both signup paths. By the time this endpoint is reachable
// from CustomerShell's widget, GET /api/customers/profile has already
// self-healed that row for a fresh Google account, so this is never a false
// negative for an actual customer.
export async function resolveCustomerId(userId: string | undefined): Promise<string | undefined> {
  if (!userId) return undefined;
  const { data } = await supabaseAdmin.from("customer_profiles").select("id").eq("id", userId).maybeSingle();
  return data ? userId : undefined;
}

// Marks a conversation resolved when a customer/guest explicitly starts a
// new one, so it doesn't linger open (possibly still "waiting" for a human)
// in the admin queue after being abandoned in favor of a fresh chat.
export async function markConversationResolved(conversationId: string): Promise<void> {
  const now = new Date().toISOString();
  await supabaseAdmin
    .from("website_chat_conversations")
    .update({ status: "resolved", resolved_at: now, updated_at: now })
    .eq("conversation_id", conversationId);
}

// A logged-in customer's conversation must be found by their account, not
// by the device cookie — see getConversationByToken's caveat below. Picks
// the most recently created contact row if a customer somehow has more than
// one (shouldn't normally happen, but is not enforced by a DB constraint).
export async function getConversationByCustomerId(
  customerId: string
): Promise<{ sessionToken: string; conversation: WebsiteChatConversationState } | null> {
  const contactResult = await supabaseAdmin
    .from("website_chat_contacts")
    .select("id, name, session_token")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (contactResult.error || !contactResult.data) return null;

  const linkResult = await supabaseAdmin
    .from("website_chat_conversations")
    .select("conversation_id, mode, status")
    .eq("contact_id", contactResult.data.id)
    .maybeSingle();
  if (linkResult.error || !linkResult.data) return null;

  return {
    sessionToken: contactResult.data.session_token,
    conversation: {
      conversationId: linkResult.data.conversation_id,
      contactId: contactResult.data.id,
      name: contactResult.data.name,
      mode: linkResult.data.mode,
      status: linkResult.data.status,
    },
  };
}

// Guest-only lookup: identifies the caller purely by an httpOnly device
// cookie. Two different people (or a guest, then a logged-in customer)
// sharing one browser would otherwise resume each other's conversation just
// because the cookie was already set on that device — callers must check
// getConversationByCustomerId first whenever the caller is authenticated.
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

// Used for the admin handoff alert (lib/websiteChat/adminAlerts.ts), which
// needs the contact's phone/email/customer_id -- none of that lives on
// WebsiteChatConversationState itself.
export async function getContactDetails(
  contactId: string
): Promise<{ name: string; phone: string | null; email: string | null; customerId: string | null } | null> {
  const { data, error } = await supabaseAdmin
    .from("website_chat_contacts")
    .select("name, phone, email, customer_id")
    .eq("id", contactId)
    .maybeSingle();
  if (error || !data) return null;
  return { name: data.name, phone: data.phone, email: data.email, customerId: data.customer_id };
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

// Written by the admin inbox (app/admin/(sub)/communication/website-chat-inbox.tsx)
// while a conversation is open there -- a heartbeat every 10s, plus a
// typing:true burst while the reply textarea has recent keystrokes and an
// explicit typing:false the moment it pauses or the reply is sent.
export async function touchAdminPresence(conversationId: string, typing: boolean): Promise<void> {
  const { error } = await supabaseAdmin
    .from("website_chat_conversations")
    .update({ admin_last_seen_at: new Date().toISOString(), admin_typing_at: typing ? new Date().toISOString() : null })
    .eq("conversation_id", conversationId);
  // Was previously silent -- a missing admin_last_seen_at/admin_typing_at
  // column (e.g. the presence migration applied to staging but not yet to
  // production) failed here with no visible symptom except "Active" and
  // "Last seen" never showing on the customer's side, with no error
  // anywhere to point at why.
  if (error) logError("touchAdminPresence failed", { conversationId, error: error.message });
}

// Read by the customer-facing widget's poll loop (GET /api/website-chat/messages)
// to show the assigned agent's name plus a live/typing/last-seen indicator
// once an agent has taken over.
export async function getAgentPresence(conversationId: string): Promise<AgentPresence> {
  const { data, error } = await supabaseAdmin
    .from("website_chat_conversations")
    .select("admin_last_seen_at, admin_typing_at, assigned_to")
    .eq("conversation_id", conversationId)
    .maybeSingle();
  if (error) logError("getAgentPresence failed", { conversationId, error: error.message });

  const lastSeenAt = data?.admin_last_seen_at ?? null;
  const typingAt = data?.admin_typing_at ?? null;
  const now = Date.now();

  let name: string | null = null;
  if (data?.assigned_to) {
    const { data: profile } = await supabaseAdmin.from("profiles").select("full_name").eq("id", data.assigned_to).maybeSingle();
    name = profile?.full_name ?? null;
  }

  return {
    online: lastSeenAt ? now - new Date(lastSeenAt).getTime() < AGENT_ONLINE_THRESHOLD_MS : false,
    typing: typingAt ? now - new Date(typingAt).getTime() < AGENT_TYPING_THRESHOLD_MS : false,
    lastSeenAt,
    name,
  };
}

export async function requestHuman(conversation: WebsiteChatConversationState): Promise<WebsiteChatConversationState> {
  const result = await supabaseAdmin
    .from("website_chat_conversations")
    .update({ mode: "human", status: "waiting", assigned_to: null, updated_at: new Date().toISOString() })
    .eq("conversation_id", conversation.conversationId);
  if (result.error) throw result.error;
  return { ...conversation, mode: "human", status: "waiting" };
}
