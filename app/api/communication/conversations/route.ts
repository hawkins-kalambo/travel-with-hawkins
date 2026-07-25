import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuthenticatedUser } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function GET(req: NextRequest) {
  const response = NextResponse.next();
  const authUser = await requireAuthenticatedUser(req, response);
  if (authUser.error || !authUser.user) {
    return jsonError("Authentication required", 401);
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("communication_conversation_participants")
      .select("conversation_id, starred, archived, last_read_at, communication_conversations(id, title, conversation_type, updated_at)")
      .eq("profile_id", authUser.user.id)
      .eq("deleted", false)
      .order("communication_conversations.updated_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ success: true, conversations: data ?? [] });
  } catch (err) {
    console.error("GET /api/communication/conversations error", err);
    return jsonError(err instanceof Error ? err.message : "Unable to load conversations", 500);
  }
}

export async function POST(req: NextRequest) {
  const response = NextResponse.next();
  const authUser = await requireAuthenticatedUser(req, response);
  if (authUser.error || !authUser.user) {
    return jsonError("Authentication required", 401);
  }

  try {
    const body = await req.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const messageBody = typeof body.body === "string" ? body.body.trim() : "";

    if (!title || !messageBody) {
      return jsonError("Title and message are required", 400);
    }

    const { data: conversationData, error: conversationError } = await supabaseAdmin
      .from("communication_conversations")
      .insert({
        title,
        conversation_type: "support",
        created_by: authUser.user.id,
      })
      .select()
      .single();

    if (conversationError) throw conversationError;

    const { error: participantError } = await supabaseAdmin.from("communication_conversation_participants").insert({
      conversation_id: conversationData.id,
      profile_id: authUser.user.id,
      role: "owner",
      deleted: false,
    });

    if (participantError) throw participantError;

    const { data: messageData, error: messageError } = await supabaseAdmin
      .from("communication_messages")
      .insert({
        conversation_id: conversationData.id,
        sender_id: authUser.user.id,
        body: messageBody,
        html: null,
        attachments: [],
      })
      .select()
      .single();

    if (messageError) throw messageError;

    return NextResponse.json({ success: true, conversation: conversationData, message: messageData });
  } catch (err) {
    console.error("POST /api/communication/conversations error", err);
    return jsonError(err instanceof Error ? err.message : "Unable to start conversation", 500);
  }
}
