import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuthenticatedUser } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

    const { data, error } = await supabaseAdmin
      .from("communication_messages")
      .select("id, sender_id, body, html, attachments, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return NextResponse.json({ success: true, messages: data ?? [] });
  } catch (err) {
    console.error("GET /api/communication/conversations/[id] error", err);
    return jsonError(err instanceof Error ? err.message : "Unable to load messages", 500);
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
    return NextResponse.json({ success: true, message: data });
  } catch (err) {
    console.error("POST /api/communication/conversations/[id] error", err);
    return jsonError(err instanceof Error ? err.message : "Unable to send message", 500);
  }
}
