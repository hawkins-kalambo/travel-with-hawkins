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

  const profileId = authUser.user.id;
  const search = req.nextUrl.searchParams.get("search")?.trim();
  const unread = req.nextUrl.searchParams.get("unread") === "true";
  const limit = Number(req.nextUrl.searchParams.get("limit") || 20);

  try {
    let query = supabaseAdmin
      .from("communication_notifications")
      .select("id, type, title, message, priority, read_at, related_type, related_id, metadata, created_at")
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (unread) query = query.is("read_at", null);
    if (search) query = query.ilike("title", `%${search}%`);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ success: true, notifications: data ?? [] });
  } catch (error) {
    console.error("GET /api/communication/notifications error", error);
    return jsonError(error instanceof Error ? error.message : "Unable to load notifications", 500);
  }
}
