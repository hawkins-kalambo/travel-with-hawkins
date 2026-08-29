import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { jsonError } from "@/lib/apiResponse";
import { approvedTemplateNames, requireWhatsAppAdmin } from "@/lib/whatsapp/admin";
import { deliverAndRecord } from "@/lib/whatsapp/repository";
import { classifySenderKind, confirmedDeliveryStatus } from "@/lib/whatsapp/inbox";
import type { WhatsAppConversationState, WhatsAppLanguage } from "@/lib/whatsapp/types";

type LoadedConversation = WhatsAppConversationState & {
  assignedTo?: string | null;
  displayName?: string | null;
  consentStatus?: string | null;
  unreadCount?: number;
};

async function loadConversation(id: string): Promise<LoadedConversation | null> {
  const result = await supabaseAdmin.from("whatsapp_conversations")
    .select("*,contact:whatsapp_contacts(*)").eq("conversation_id", id).maybeSingle();
  if (result.error || !result.data) return null;
  const contact = Array.isArray(result.data.contact) ? result.data.contact[0] : result.data.contact;
  return {
    conversationId: id, contactId: contact.id, waId: contact.wa_id,
    language: contact.language as WhatsAppLanguage, mode: result.data.mode, status: result.data.status,
    step: result.data.state_step, data: result.data.state_data || {}, version: Number(result.data.state_version),
    serviceWindowExpiresAt: contact.service_window_expires_at, assignedTo: result.data.assigned_to,
    displayName: contact.display_name, consentStatus: contact.consent_status,
    unreadCount: Number(result.data.unread_count) || 0,
  };
}

// Booking card fields the inbox renders instead of raw JSON. Transport
// assignment (departure_id / assigned_at) is reported SEPARATELY from the
// booking-fee and fare payment states; an unassigned booking never implies a
// confirmed seat.
function bookingCard(row: Record<string, unknown>) {
  const departureId = row.departure_id ? String(row.departure_id) : null;
  const feeAmount = Number(row.booking_fee_amount) || 0;
  const feePaid = String(row.booking_fee_status || "unpaid") === "paid";
  const fare = Number(row.fare) || 0;
  const farePaid = String(row.fare_status || "unpaid") === "paid";
  return {
    bookingId: String(row.booking_id || ""),
    passengerName: String(row.name || ""),
    bookerPhone: String(row.phone || ""),
    email: row.email ? String(row.email) : null,
    route: String(row.destination || "Trip"),
    requestedDate: String(row.travel_date || ""),
    status: String(row.status || "Booked"),
    source: String(row.booking_source || "web"),
    transportAssigned: Boolean(departureId),
    assignedAt: row.assigned_at ? String(row.assigned_at) : null,
    bookingFeeStatus: String(row.booking_fee_status || "unpaid"),
    bookingFeeAmount: feeAmount,
    fareStatus: String(row.fare_status || "unpaid"),
    fareAmount: fare,
    outstanding: (feePaid ? 0 : feeAmount) + (farePaid ? 0 : fare),
    deadline: !feePaid && row.booking_expires_at ? String(row.booking_expires_at) : null,
  };
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = await requireWhatsAppAdmin(req);
  if (!access.authorized) return jsonError(access.error, access.status);
  const { id } = await context.params;
  const conversation = await loadConversation(id);
  if (!conversation) return jsonError("Conversation not found", 404);

  const [messages, notes, operations, agents, media] = await Promise.all([
    supabaseAdmin.from("communication_messages")
      .select("id,sender_id,body,direction,message_kind,attachments,provider_status,provider_error_code,provider_metadata,template_name,created_at")
      .eq("conversation_id", id).eq("channel", "whatsapp").eq("visibility", "customer").order("created_at"),
    supabaseAdmin.from("whatsapp_internal_notes").select("id,author_id,body,created_at").eq("conversation_id", id).order("created_at"),
    supabaseAdmin.from("whatsapp_booking_operations").select("booking_id,status,created_at").eq("conversation_id", id).order("created_at", { ascending: false }).limit(10),
    supabaseAdmin.from("profiles").select("id,full_name,email,role").in("role", ["admin", "super_admin"]).order("full_name"),
    supabaseAdmin.from("whatsapp_media")
      .select("id,message_id,kind,mime_type,file_name,byte_size,status,error_code,caption,created_at,uploaded_by")
      .eq("conversation_id", id).order("created_at", { ascending: false }).limit(50),
  ]);

  const agentName = new Map((agents.data ?? []).map((a) => [a.id, a.full_name || a.email || a.id]));
  const linkedBookingIds = (operations.data ?? []).map((row) => row.booking_id).filter(Boolean);
  const contactBookings = await supabaseAdmin.from("bookings")
    .select("booking_id,name,phone,email,destination,travel_date,status,booking_source,departure_id,assigned_at,booking_fee_status,booking_fee_amount,fare_status,fare,booking_expires_at")
    .eq("phone", conversation.waId).order("created_at", { ascending: false }).limit(10);
  const bookings = (contactBookings.data ?? []).map(bookingCard);
  const bookingIds = Array.from(new Set([...linkedBookingIds, ...bookings.map((b) => b.bookingId)])).filter(Boolean);
  const payments = bookingIds.length
    ? await supabaseAdmin.from("payments").select("id,booking_id,payment_type,status,expected_amount,currency,paid_at,internal_reference").in("booking_id", bookingIds).order("created_at", { ascending: false })
    : { data: [] as Array<Record<string, unknown>> };
  const paidPaymentIds = (payments.data ?? []).filter((p) => p.status === "paid").map((p) => p.id as string);
  const deliveries = paidPaymentIds.length
    ? await supabaseAdmin.from("payment_receipt_deliveries").select("payment_id,channel,status,error_message,sent_at,attempts").in("payment_id", paidPaymentIds)
    : { data: [] as Array<Record<string, unknown>> };
  const paymentById = new Map((payments.data ?? []).map((p) => [p.id as string, p]));
  const receipts = (deliveries.data ?? []).map((d) => {
    const p = paymentById.get(d.payment_id as string);
    return {
      paymentId: d.payment_id, bookingId: p?.booking_id ?? null, paymentType: p?.payment_type ?? null,
      channel: d.channel, status: d.status, errorMessage: d.error_message || null,
      sentAt: d.sent_at || null, attempts: Number(d.attempts) || 0,
    };
  });

  const transcript = (messages.data ?? []).map((row) => ({
    id: row.id,
    body: row.body,
    kind: classifySenderKind(row),
    messageKind: row.message_kind,
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
    templateName: row.template_name,
    deliveryStatus: row.direction === "outbound" ? confirmedDeliveryStatus(row.provider_status) : null,
    errorCode: row.provider_error_code || null,
    senderName: row.sender_id ? agentName.get(row.sender_id) || "Agent" : null,
    createdAt: row.created_at,
  }));

  // The agent has opened the thread — clear its unread badge.
  await supabaseAdmin.rpc("clear_whatsapp_unread", { p_conversation_id: id });

  return NextResponse.json({
    success: true,
    conversation: {
      conversationId: conversation.conversationId,
      waId: conversation.waId,
      displayName: conversation.displayName,
      language: conversation.language,
      consentStatus: conversation.consentStatus,
      mode: conversation.mode,
      status: conversation.status,
      assignedTo: conversation.assignedTo ?? null,
      assignedAgentName: conversation.assignedTo ? agentName.get(conversation.assignedTo) || null : null,
      serviceWindowExpiresAt: conversation.serviceWindowExpiresAt ?? null,
      unreadCount: conversation.unreadCount ?? 0,
      viewerId: access.user.id,
      viewerRole: access.role,
    },
    messages: transcript,
    notes: (notes.data ?? []).map((n) => ({ ...n, authorName: agentName.get(n.author_id) || null })),
    bookings,
    payments: payments.data ?? [],
    receipts,
    agents: agents.data ?? [],
    media: (media.data ?? []).map((m) => ({
      id: m.id, messageId: m.message_id, kind: m.kind, mimeType: m.mime_type,
      fileName: m.file_name, byteSize: Number(m.byte_size) || 0, status: m.status,
      errorCode: m.error_code || null, caption: m.caption || null, createdAt: m.created_at,
      uploadedByName: m.uploaded_by ? agentName.get(m.uploaded_by) || null : null,
    })),
  });
}

const OWNERSHIP_ACTIONS = new Set(["takeover", "resolve", "bot", "assign"]);

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = await requireWhatsAppAdmin(req);
  if (!access.authorized) return jsonError(access.error, access.status);
  const { id } = await context.params;
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "";
  if (!OWNERSHIP_ACTIONS.has(action)) return jsonError("Unsupported action", 400);

  let target: string | null = null;
  if (action === "assign") {
    target = typeof body.assigneeId === "string" ? body.assigneeId : "";
    const assignee = await supabaseAdmin.from("profiles").select("id,role").eq("id", target).in("role", ["admin", "super_admin"]).maybeSingle();
    if (!assignee.data) return jsonError("Assignee is not an authorized administrator", 400);
  }

  // A deliberate reassignment / steal is allowed only for a super admin, and
  // only when the client explicitly asked (force). Everyone else gets a 409
  // telling them who holds the conversation.
  const force = body.force === true && access.role === "super_admin";
  const result = await supabaseAdmin.rpc("claim_whatsapp_conversation", {
    p_conversation_id: id, p_actor: access.user.id, p_action: action,
    p_target: target, p_force: force,
  });
  if (result.error) return jsonError("Unable to update conversation", 500);
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!row || row.outcome === "not_found") return jsonError("Conversation not found", 404);
  if (row.outcome === "bad_action") return jsonError("Unsupported action", 400);
  if (row.outcome === "conflict") {
    const holder = row.assigned_to ? await supabaseAdmin.from("profiles").select("full_name,email").eq("id", row.assigned_to).maybeSingle() : { data: null };
    const name = holder.data?.full_name || holder.data?.email || "another agent";
    return NextResponse.json({ success: false, error: `Held by ${name}`, conflict: true, holder: row.assigned_to }, { status: 409 });
  }
  return NextResponse.json({ success: true, conversation: { mode: row.mode, status: row.status, assignedTo: row.assigned_to } });
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
  // Ownership guard: only the holder (or an unassigned conversation) may reply.
  if (conversation.assignedTo && conversation.assignedTo !== access.user.id) {
    return NextResponse.json({ success: false, error: "Another agent holds this conversation", conflict: true }, { status: 409 });
  }

  const insideWindow = conversation.serviceWindowExpiresAt && new Date(conversation.serviceWindowExpiresAt).getTime() > Date.now();
  let outbound;
  if (insideWindow) outbound = { type: "text" as const, text };
  else {
    const templateName = typeof body.templateName === "string" ? body.templateName.trim() : "";
    if (!templateName || !approvedTemplateNames().has(templateName)) return jsonError("An approved template is required outside the customer-service window", 409);
    outbound = { type: "template" as const, name: templateName, languageCode: conversation.language === "ny" ? "ny" : "en", parameters: [text] };
  }
  try {
    const providerMessageId = await deliverAndRecord(conversation, outbound, access.user.id, "agent");
    return NextResponse.json({ success: true, providerMessageId });
  } catch {
    return jsonError("WhatsApp message could not be sent", 502);
  }
}
