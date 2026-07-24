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
