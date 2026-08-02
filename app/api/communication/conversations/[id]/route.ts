import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuthenticatedUser } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getErrorMessage } from "@/lib/communicationServer";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const response = NextResponse.next();
  const authUser = await requireAuthenticatedUser(req, response);
  if (authUser.error || !authUser.user) {
    return jsonError("Authentication required", 401);
  }

  const { id: conversationId } = await context.params;
  const profileId = authUser.user.id;

  try {
    const participation = await supabaseAdmin
      .from("communication_conversation_participants")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("profile_id", profileId)
      .eq("deleted", false)
      .maybeSingle();

    if (participation.error || !participation.data) {
      return jsonError("Conversation not found or access denied", 404);
    }

    const [{ data: messages, error }, { data: conversation }, { data: participants }] = await Promise.all([
      supabaseAdmin
        .from("communication_messages")
        .select("id, sender_id, body, html, attachments, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true }),
      supabaseAdmin.from("communication_conversations").select("id, title, conversation_type, updated_at").eq("id", conversationId).maybeSingle(),
      supabaseAdmin
        .from("communication_conversation_participants")
        .select("profile_id, role, profiles(id, full_name, role)")
        .eq("conversation_id", conversationId)
        .eq("deleted", false),
    ]);

    if (error) throw error;

    await supabaseAdmin
      .from("communication_conversation_participants")
      .update({ last_read_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .eq("profile_id", profileId);

    const senderIds = Array.from(new Set((messages ?? []).map((entry) => entry.sender_id).filter(Boolean)));
    const { data: senderProfiles } = senderIds.length
      ? await supabaseAdmin.from("profiles").select("id, full_name, role").in("id", senderIds)
      : { data: [] };
    const senderMap = new Map((senderProfiles ?? []).map((entry) => [entry.id, entry]));

    const enrichedMessages = (messages ?? []).map((entry) => ({
      ...entry,
      sender_name: senderMap.get(entry.sender_id ?? "")?.full_name ?? "Travel with Hawkins",
      sender_role: senderMap.get(entry.sender_id ?? "")?.role ?? null,
    }));

    return NextResponse.json({
      success: true,
      messages: enrichedMessages,
      conversation: conversation ?? null,
      participants: participants ?? [],
    });
  } catch (err) {
    console.error("GET /api/communication/conversations/[id] error", err);
    return jsonError(getErrorMessage(err, "Unable to load messages"), 500);
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const response = NextResponse.next();
  const authUser = await requireAuthenticatedUser(req, response);
  if (authUser.error || !authUser.user) {
    return jsonError("Authentication required", 401);
  }

  const { id: conversationId } = await context.params;
  const profileId = authUser.user.id;
  const body = await req.json();
  const messageBody = typeof body.body === "string" ? body.body.trim() : "";
  const html = typeof body.html === "string" ? body.html : null;

  if (!messageBody && !html) {
    return jsonError("Message content is required", 400);
  }

  try {
    const participation = await supabaseAdmin
      .from("communication_conversation_participants")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("profile_id", profileId)
      .eq("deleted", false)
      .maybeSingle();

    if (participation.error || !participation.data) {
      return jsonError("Conversation not found or access denied", 404);
    }

    const { data, error } = await supabaseAdmin
      .from("communication_messages")
      .insert({
        conversation_id: conversationId,
        sender_id: profileId,
        body: messageBody,
        html,
        attachments: Array.isArray(body.attachments) ? body.attachments : [],
      })
      .select()
      .single();

    if (error) throw error;

    await supabaseAdmin
      .from("communication_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    const [{ data: otherParticipants }, { data: senderProfile }, { data: conversation }] = await Promise.all([
      supabaseAdmin
        .from("communication_conversation_participants")
        .select("profile_id")
        .eq("conversation_id", conversationId)
        .eq("deleted", false)
        .neq("profile_id", profileId),
      supabaseAdmin.from("profiles").select("full_name").eq("id", profileId).maybeSingle(),
      supabaseAdmin.from("communication_conversations").select("title").eq("id", conversationId).maybeSingle(),
    ]);

    const notifications = (otherParticipants ?? [])
      .filter((participant) => participant?.profile_id)
      .map((participant) => ({
        profile_id: participant.profile_id,
        type: "message",
        title: `New reply: ${conversation?.title || "Conversation"}`,
        message: messageBody.length > 180 ? `${messageBody.slice(0, 177)}...` : messageBody,
        priority: "normal",
        related_type: "conversation",
        related_id: conversationId,
        metadata: { conversation_id: conversationId, sender_name: senderProfile?.full_name || "Travel with Hawkins" },
      }));

    if (notifications.length > 0) {
      const { error: notificationError } = await supabaseAdmin.from("communication_notifications").insert(notifications);
      if (notificationError) {
        console.warn("Failed to create reply notifications", notificationError.message);
      }
    }

    return NextResponse.json({ success: true, message: data });
  } catch (err) {
    console.error("POST /api/communication/conversations/[id] error", err);
    return jsonError(getErrorMessage(err, "Unable to send message"), 500);
  }
}
