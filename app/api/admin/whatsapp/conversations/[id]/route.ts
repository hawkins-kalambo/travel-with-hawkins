import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { jsonError } from "@/lib/apiResponse";
import { approvedTemplateNames, requireWhatsAppAdmin } from "@/lib/whatsapp/admin";
import { deliverAndRecord } from "@/lib/whatsapp/repository";
import type { WhatsAppConversationState, WhatsAppLanguage } from "@/lib/whatsapp/types";

async function loadConversation(id: string): Promise<(WhatsAppConversationState & { assignedTo?: string | null }) | null> {
  const result = await supabaseAdmin.from("whatsapp_conversations").select("*,contact:whatsapp_contacts(*)").eq("conversation_id", id).maybeSingle();
  if (result.error || !result.data) return null;
  const contact = Array.isArray(result.data.contact) ? result.data.contact[0] : result.data.contact;
  return {
    conversationId: id, contactId: contact.id, waId: contact.wa_id,
    language: contact.language as WhatsAppLanguage, mode: result.data.mode, status: result.data.status,
    step: result.data.state_step, data: result.data.state_data || {}, version: Number(result.data.state_version),
    serviceWindowExpiresAt: contact.service_window_expires_at, assignedTo: result.data.assigned_to,
  };
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = await requireWhatsAppAdmin(req);
  if (!access.authorized) return jsonError(access.error, access.status);
  const { id } = await context.params;
  const conversation = await loadConversation(id);
  if (!conversation) return jsonError("Conversation not found", 404);
  const [messages, notes, operations, agents] = await Promise.all([
    supabaseAdmin.from("communication_messages").select("id,sender_id,body,direction,message_kind,provider_status,provider_error_code,created_at").eq("conversation_id", id).eq("channel", "whatsapp").eq("visibility", "customer").order("created_at"),
    supabaseAdmin.from("whatsapp_internal_notes").select("id,author_id,body,created_at").eq("conversation_id", id).order("created_at"),
    supabaseAdmin.from("whatsapp_booking_operations").select("booking_id,status,created_at").eq("conversation_id", id).order("created_at", { ascending: false }).limit(10),
    supabaseAdmin.from("profiles").select("id,full_name,email,role").in("role", ["admin", "super_admin"]).order("full_name"),
  ]);
  const linkedBookingIds = (operations.data ?? []).map((row) => row.booking_id).filter(Boolean);
  const contactBookings = await supabaseAdmin.from("bookings").select("booking_id,destination,travel_date,status,booking_fee_status,fare_status,pickup").eq("phone", conversation.waId).order("created_at", { ascending: false }).limit(10);
  const bookings = contactBookings.data ?? [];
  const bookingIds = Array.from(new Set([...linkedBookingIds, ...bookings.map((booking) => booking.booking_id)]));
  const payments = bookingIds.length ? await supabaseAdmin.from("payments").select("booking_id,payment_type,status,expected_amount,currency,paid_at").in("booking_id", bookingIds).order("created_at", { ascending: false }) : { data: [] };
  return NextResponse.json({ success: true, conversation, messages: messages.data ?? [], notes: notes.data ?? [], bookings, payments: payments.data ?? [], agents: agents.data ?? [] });
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = await requireWhatsAppAdmin(req);
  if (!access.authorized) return jsonError(access.error, access.status);
  const { id } = await context.params;
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "";
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (action === "takeover") Object.assign(payload, { mode: "human", status: "human_controlled", assigned_to: access.user.id, resolved_at: null });
  else if (action === "resolve") Object.assign(payload, { mode: "human", status: "resolved", resolved_at: new Date().toISOString() });
  else if (action === "bot") Object.assign(payload, { mode: "bot", status: "bot_controlled", assigned_to: null, resolved_at: null, state_step: "menu", state_data: {} });
  else if (action === "assign") {
    const assigneeId = typeof body.assigneeId === "string" ? body.assigneeId : "";
    const assignee = await supabaseAdmin.from("profiles").select("id,role").eq("id", assigneeId).in("role", ["admin", "super_admin"]).maybeSingle();
    if (!assignee.data) return jsonError("Assignee is not an authorized administrator", 400);
    Object.assign(payload, { mode: "human", status: "human_controlled", assigned_to: assigneeId, resolved_at: null });
  } else return jsonError("Unsupported action", 400);
  const result = await supabaseAdmin.from("whatsapp_conversations").update(payload).eq("conversation_id", id).select().maybeSingle();
  if (result.error || !result.data) return jsonError("Conversation not found", 404);
  return NextResponse.json({ success: true, conversation: result.data });
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = await requireWhatsAppAdmin(req);
  if (!access.authorized) return jsonError(access.error, access.status);
  const { id } = await context.params;
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const type = typeof body.type === "string" ? body.type : "reply";
  const text = typeof body.body === "string" ? body.body.replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, 4096) : "";
  if (!text) return jsonError("Message content is required", 400);
  if (type === "note") {
    const note = await supabaseAdmin.from("whatsapp_internal_notes").insert({ conversation_id: id, author_id: access.user.id, body: text }).select().single();
    if (note.error) return jsonError("Unable to save note", 500);
    return NextResponse.json({ success: true, note: note.data });
  }
  const conversation = await loadConversation(id);
  if (!conversation) return jsonError("Conversation not found", 404);
  if (conversation.mode !== "human") return jsonError("Take over the conversation before replying", 409);
  const insideWindow = conversation.serviceWindowExpiresAt && new Date(conversation.serviceWindowExpiresAt).getTime() > Date.now();
  let outbound;
  if (insideWindow) outbound = { type: "text" as const, text };
  else {
    const templateName = typeof body.templateName === "string" ? body.templateName.trim() : "";
    if (!templateName || !approvedTemplateNames().has(templateName)) return jsonError("An approved template is required outside the customer-service window", 409);
    outbound = { type: "template" as const, name: templateName, languageCode: conversation.language === "ny" ? "ny" : "en", parameters: [text] };
  }
  try { const providerMessageId = await deliverAndRecord(conversation, outbound, access.user.id); return NextResponse.json({ success: true, providerMessageId }); }
  catch { return jsonError("WhatsApp message could not be sent", 502); }
}
