import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { jsonError } from "@/lib/apiResponse";
import { requireWebsiteChatAdmin } from "@/lib/websiteChat/admin";
import { getMessages, touchAdminPresence } from "@/lib/websiteChat/repository";
import type { WebsiteChatConversationState } from "@/lib/websiteChat/types";

async function loadConversation(id: string): Promise<(WebsiteChatConversationState & { assignedTo?: string | null }) | null> {
  const result = await supabaseAdmin
    .from("website_chat_conversations")
    .select("*, contact:website_chat_contacts(*)")
    .eq("conversation_id", id)
    .maybeSingle();
  if (result.error || !result.data) return null;
  const contact = Array.isArray(result.data.contact) ? result.data.contact[0] : result.data.contact;
  if (!contact) return null;
  return {
    conversationId: id,
    contactId: contact.id,
    name: contact.name,
    mode: result.data.mode,
    status: result.data.status,
    assignedTo: result.data.assigned_to,
  };
}

function sanitizeReplyBody(raw: string): string {
  let out = "";
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0;
    const isControl = code < 32;
    const isAngleBracket = ch === "<" || ch === ">";
    out += isControl || isAngleBracket ? " " : ch;
  }
  return out.trim().slice(0, 4096);
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = await requireWebsiteChatAdmin(req);
  if (!access.authorized) return jsonError(access.error, access.status);

  const { id } = await context.params;
  const conversation = await loadConversation(id);
  if (!conversation) return jsonError("Conversation not found", 404);

  const [messages, agents, contactRow] = await Promise.all([
    getMessages(conversation),
    supabaseAdmin.from("profiles").select("id,full_name,email,role").in("role", ["admin", "super_admin"]).order("full_name"),
    supabaseAdmin.from("website_chat_contacts").select("phone,email").eq("id", conversation.contactId).maybeSingle(),
  ]);

  return NextResponse.json({
    success: true,
    conversation,
    contact: contactRow.data ?? null,
    messages,
    agents: agents.data ?? [],
  });
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = await requireWebsiteChatAdmin(req);
  if (!access.authorized) return jsonError(access.error, access.status);

  const { id } = await context.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "";

  // High-frequency (a 10s heartbeat plus a burst per keystroke) and only
  // ever touches admin_last_seen_at/admin_typing_at -- kept out of the
  // shared payload/select-back below so it's a single lightweight write.
  if (action === "presence") {
    await touchAdminPresence(id, body.typing === true);
    return NextResponse.json({ success: true });
  }

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (action === "takeover") Object.assign(payload, { mode: "human", status: "human_controlled", assigned_to: access.user.id, resolved_at: null });
  else if (action === "resolve") Object.assign(payload, { mode: "human", status: "resolved", resolved_at: new Date().toISOString() });
  else if (action === "bot") Object.assign(payload, { mode: "bot", status: "bot_controlled", assigned_to: null, resolved_at: null });
  else if (action === "assign") {
    const assigneeId = typeof body.assigneeId === "string" ? body.assigneeId : "";
    const assignee = await supabaseAdmin.from("profiles").select("id,role").eq("id", assigneeId).in("role", ["admin", "super_admin"]).maybeSingle();
    if (!assignee.data) return jsonError("Assignee is not an authorized administrator", 400);
    Object.assign(payload, { mode: "human", status: "human_controlled", assigned_to: assigneeId, resolved_at: null });
  } else return jsonError("Unsupported action", 400);

  const result = await supabaseAdmin.from("website_chat_conversations").update(payload).eq("conversation_id", id).select().maybeSingle();
  if (result.error || !result.data) return jsonError("Conversation not found", 404);
  return NextResponse.json({ success: true, conversation: result.data });
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = await requireWebsiteChatAdmin(req);
  if (!access.authorized) return jsonError(access.error, access.status);

  const { id } = await context.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const text = typeof body.body === "string" ? sanitizeReplyBody(body.body) : "";
  if (!text) return jsonError("Message content is required", 400);

  const conversation = await loadConversation(id);
  if (!conversation) return jsonError("Conversation not found", 404);
  if (conversation.mode !== "human") return jsonError("Take over the conversation before replying", 409);

  const result = await supabaseAdmin
    .from("communication_messages")
    .insert({
      conversation_id: id, sender_id: access.user.id, body: text, html: null, attachments: [],
      channel: "website", direction: "outbound", visibility: "customer", message_kind: "text",
    })
    .select("id, created_at")
    .single();
  if (result.error || !result.data) return jsonError("Unable to send message", 500);

  await supabaseAdmin.from("website_chat_conversations").update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("conversation_id", id);
  await supabaseAdmin.from("communication_conversations").update({ updated_at: new Date().toISOString() }).eq("id", id);

  return NextResponse.json({ success: true, message: { id: result.data.id, senderKind: "admin", senderName: "You", body: text, createdAt: result.data.created_at } });
}
