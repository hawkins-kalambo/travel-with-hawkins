import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { jsonError } from "@/lib/apiResponse";
import { requireWebsiteChatAdmin } from "@/lib/websiteChat/admin";

export async function GET(req: NextRequest) {
  const access = await requireWebsiteChatAdmin(req);
  if (!access.authorized) return jsonError(access.error, access.status);

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const search = (url.searchParams.get("q") || "").trim().toLowerCase();

  let query = supabaseAdmin
    .from("website_chat_conversations")
    .select("conversation_id,mode,status,assigned_to,last_message_at,contact:website_chat_contacts(id,name,phone,email)")
    .order("last_message_at", { ascending: false })
    .limit(100);
  if (status && ["bot_controlled", "waiting", "human_controlled", "resolved"].includes(status)) {
    query = query.eq("status", status);
  }

  const result = await query;
  if (result.error) return jsonError("Unable to load website chat conversations", 500);

  const conversations = (result.data ?? []).filter((row) => {
    if (!search) return true;
    const contact = Array.isArray(row.contact) ? row.contact[0] : row.contact;
    return `${contact?.name || ""} ${contact?.phone || ""} ${contact?.email || ""} ${row.status}`.toLowerCase().includes(search);
  });

  return NextResponse.json({ success: true, conversations });
}
