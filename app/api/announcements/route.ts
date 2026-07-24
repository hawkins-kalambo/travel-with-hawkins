import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function GET(req: NextRequest) {
  const response = NextResponse.next();
  const { authorized, error } = await requireAdminUser(req, response);
  if (!authorized) return jsonError(error || "Unauthorized", 401);

  try {
    const { data, error: fetchError } = await supabaseAdmin
      .from("communication_announcements")
      .select("id, title, body, audience, pinned, published_at, expires_at, created_by")
      .order("pinned", { ascending: false })
      .order("published_at", { ascending: false });

    if (fetchError) {
      if (fetchError.message?.includes("does not exist")) {
        // Table not created yet
        return NextResponse.json({ success: true, announcements: [] });
      }
      throw fetchError;
    }

    return NextResponse.json({ success: true, announcements: data ?? [] });
  } catch (error) {
    console.error("GET /api/announcements error", error);
    return jsonError(error instanceof Error ? error.message : "Unable to load announcements", 500);
  }
}

export async function POST(req: NextRequest) {
  const response = NextResponse.next();
  const { authorized, user, error } = await requireAdminUser(req, response);
  if (!authorized || !user) return jsonError(error || "Unauthorized", 401);

  try {
    const body = await req.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const bodyText = typeof body.body === "string" ? body.body.trim() : "";
    const audience = typeof body.audience === "string" ? body.audience : "everyone";
    const pinned = Boolean(body.pinned);

    if (!title || !bodyText) {
      return jsonError("Title and body are required", 400);
    }

    const { data, error: insertError } = await supabaseAdmin
      .from("communication_announcements")
      .insert({
        title,
        body: bodyText,
        audience,
        pinned,
        created_by: user.id,
        published_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      if (insertError.message?.includes("does not exist")) {
        return jsonError("Communication system not yet initialized", 500);
      }
      throw insertError;
    }

    return NextResponse.json({ success: true, announcement: data });
  } catch (error) {
    console.error("POST /api/announcements error", error);
    return jsonError(error instanceof Error ? error.message : "Unable to create announcement", 500);
  }
}

export async function PATCH(req: NextRequest) {
  const response = NextResponse.next();
  const { authorized, error } = await requireAdminUser(req, response);
  if (!authorized) return jsonError(error || "Unauthorized", 401);

  try {
    const body = await req.json();
    const announcementId = typeof body.id === "string" ? body.id : "";
    const updates: Record<string, unknown> = {};

    if (typeof body.pinned === "boolean") updates.pinned = body.pinned;
    if (body.expires_at) updates.expires_at = body.expires_at;

    if (!announcementId || Object.keys(updates).length === 0) {
      return jsonError("Announcement ID and at least one update field required", 400);
    }

    const { data, error: updateError } = await supabaseAdmin
      .from("communication_announcements")
      .update(updates)
      .eq("id", announcementId)
      .select()
      .single();

    if (updateError) throw updateError;
    return NextResponse.json({ success: true, announcement: data });
  } catch (error) {
    console.error("PATCH /api/announcements error", error);
    return jsonError(error instanceof Error ? error.message : "Unable to update announcement", 500);
  }
}

export async function DELETE(req: NextRequest) {
  const response = NextResponse.next();
  const { authorized, error } = await requireAdminUser(req, response);
  if (!authorized) return jsonError(error || "Unauthorized", 401);

  try {
    const body = await req.json();
    const announcementId = typeof body.id === "string" ? body.id : "";

    if (!announcementId) {
      return jsonError("Announcement ID required", 400);
    }

    const { error: deleteError } = await supabaseAdmin
      .from("communication_announcements")
      .delete()
      .eq("id", announcementId);

    if (deleteError) throw deleteError;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/announcements error", error);
    return jsonError(error instanceof Error ? error.message : "Unable to delete announcement", 500);
  }
}
