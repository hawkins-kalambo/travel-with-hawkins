import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function GET(req: NextRequest) {
  const response = NextResponse.next();
  const { authorized } = await requireAdminUser(req, response);
  if (!authorized) return jsonError("Unauthorized", 401);

  try {
    const { data, error } = await supabaseAdmin
      .from("communication_announcements")
      .select("id, title, body, audience, pinned, published_at, expires_at, created_by")
      .order("pinned", { ascending: false })
      .order("published_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ success: true, announcements: data ?? [] });
  } catch (err) {
    console.error("GET /api/communication/announcements error", err);
    return jsonError(err instanceof Error ? err.message : "Unable to load announcements", 500);
  }
}

export async function POST(req: NextRequest) {
  const response = NextResponse.next();
  const { authorized, user, error } = await requireAdminUser(req, response);
  if (!authorized || !user) return jsonError(error || "Unauthorized", 401);

  try {
    const body = await req.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const announcementBody = typeof body.body === "string" ? body.body.trim() : "";
    const audience = typeof body.audience === "string" ? body.audience : "everyone";
    const pinned = Boolean(body.pinned);

    if (!title || !announcementBody) {
      return jsonError("Title and body are required", 400);
    }

    const { data, error: insertError } = await supabaseAdmin
      .from("communication_announcements")
      .insert({
        title,
        body: announcementBody,
        audience,
        pinned,
        created_by: user.id,
        published_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) throw insertError;
    return NextResponse.json({ success: true, announcement: data });
  } catch (err) {
    console.error("POST /api/communication/announcements error", err);
    return jsonError(err instanceof Error ? err.message : "Unable to create announcement", 500);
  }
}

export async function PATCH(req: NextRequest) {
  const response = NextResponse.next();
  const { authorized } = await requireAdminUser(req, response);
  if (!authorized) return jsonError("Unauthorized", 401);

  try {
    const body = await req.json();
    const announcementId = typeof body.id === "string" ? body.id : "";
    const updates: Record<string, unknown> = {};

    if (typeof body.pinned === "boolean") updates.pinned = body.pinned;
    if (typeof body.expires_at === "string") updates.expires_at = body.expires_at;

    if (!announcementId || Object.keys(updates).length === 0) {
      return jsonError("Announcement ID and at least one update field required", 400);
    }

    const { data, error } = await supabaseAdmin
      .from("communication_announcements")
      .update(updates)
      .eq("id", announcementId)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, announcement: data });
  } catch (err) {
    console.error("PATCH /api/communication/announcements error", err);
    return jsonError(err instanceof Error ? err.message : "Unable to update announcement", 500);
  }
}

export async function DELETE(req: NextRequest) {
  const response = NextResponse.next();
  const { authorized } = await requireAdminUser(req, response);
  if (!authorized) return jsonError("Unauthorized", 401);

  try {
    const body = await req.json();
    const announcementId = typeof body.id === "string" ? body.id : "";
    if (!announcementId) return jsonError("Announcement ID required", 400);

    const { error } = await supabaseAdmin
      .from("communication_announcements")
      .delete()
      .eq("id", announcementId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/communication/announcements error", err);
    return jsonError(err instanceof Error ? err.message : "Unable to delete announcement", 500);
  }
}
