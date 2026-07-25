import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuthenticatedUser } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
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

export async function PATCH(req: NextRequest) {
  const response = NextResponse.next();
  const authUser = await requireAuthenticatedUser(req, response);
  if (authUser.error || !authUser.user) {
    return jsonError("Authentication required", 401);
  }

  try {
    const body = await req.json();
    const profileId = authUser.user.id;
    const action = typeof body.action === "string" ? body.action : "read";
    const notificationId = typeof body.id === "string" ? body.id : "";
    const markAllRead = body.markAllRead === true;

    if (markAllRead) {
      const { error } = await supabaseAdmin.from("communication_notifications").update({ read_at: new Date().toISOString() }).eq("profile_id", profileId).is("read_at", null);
      if (error) throw error;
      return NextResponse.json({ success: true, updatedCount: 0 });
    }

    if (!notificationId) {
      return jsonError("Notification ID is required", 400);
    }

    const updatePayload: Record<string, unknown> = {};

    if (action === "read") {
      updatePayload.read_at = new Date().toISOString();
    } else if (action === "unread") {
      updatePayload.read_at = null;
    } else if (action === "archive") {
      const { data: existingRow, error: existingError } = await supabaseAdmin
        .from("communication_notifications")
        .select("metadata")
        .eq("id", notificationId)
        .eq("profile_id", profileId)
        .maybeSingle();

      if (existingError) throw existingError;

      updatePayload.metadata = {
        ...normalizeMetadata(existingRow?.metadata),
        archived: true,
      };
    }

    const { error } = await supabaseAdmin.from("communication_notifications").update(updatePayload).eq("id", notificationId).eq("profile_id", profileId);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PATCH /api/communication/notifications error", error);
    return jsonError(error instanceof Error ? error.message : "Unable to update notification", 500);
  }
}
