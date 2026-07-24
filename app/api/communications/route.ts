import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuthenticatedUser, requireAdminUser } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function normalizeRole(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export async function GET(req: NextRequest) {
  const response = NextResponse.next();
  const authUser = await requireAuthenticatedUser(req, response);
  if (authUser.error || !authUser.user) {
    return jsonError("Authentication required", 401);
  }

  try {
    const { authorized } = await requireAdminUser(req, response);
    const profileId = authUser.user.id;

    const { data: profileData, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, role, full_name, email")
      .eq("id", profileId)
      .maybeSingle();

    if (profileError) {
      console.warn("Unable to load profile for communications summary", profileError);
    }

    const role = normalizeRole(profileData?.role || authUser.user.user_metadata?.role);
    const isAdmin = authorized || role === "admin" || role === "super_admin";

    const [notificationsResult, conversationsResult, ticketsResult, announcementsResult] = await Promise.allSettled([
      supabaseAdmin
        .from("communication_notifications")
        .select("id, type, title, message, priority, read_at, related_type, related_id, created_at")
        .eq("profile_id", profileId)
        .order("created_at", { ascending: false })
        .limit(10),
      supabaseAdmin
        .from("communication_conversation_participants")
        .select("conversation_id, starred, archived, last_read_at, communication_conversations(id, title, conversation_type, updated_at)")
        .eq("profile_id", profileId)
        .eq("deleted", false)
        .order("updated_at", { ascending: false })
        .limit(10),
      supabaseAdmin
        .from("communication_support_tickets")
        .select("id, subject, category, status, priority, created_at")
        .eq("requester_id", profileId)
        .order("created_at", { ascending: false })
        .limit(10),
      supabaseAdmin
        .from("communication_announcements")
        .select("id, title, body, audience, pinned, published_at, expires_at")
        .order("pinned", { ascending: false })
        .order("published_at", { ascending: false })
        .limit(10),
    ]);

    const notifications = notificationsResult.status === "fulfilled" ? notificationsResult.value.data ?? [] : [];
    const conversations = conversationsResult.status === "fulfilled" ? conversationsResult.value.data ?? [] : [];
    const tickets = ticketsResult.status === "fulfilled" ? ticketsResult.value.data ?? [] : [];
    const announcements = announcementsResult.status === "fulfilled" ? announcementsResult.value.data ?? [] : [];

    return NextResponse.json({
      success: true,
      isAdmin,
      profile: profileData ?? null,
      notifications,
      conversations,
      tickets,
      announcements,
      summary: {
        notifications: notifications.length,
        conversations: conversations.length,
        tickets: tickets.length,
        announcements: announcements.length,
      },
    });
  } catch (error) {
    console.error("GET /api/communications error", error);
    return jsonError(error instanceof Error ? error.message : "Unable to load communication center", 500);
  }
}

export async function POST(req: NextRequest) {
  const response = NextResponse.next();
  const authUser = await requireAuthenticatedUser(req, response);
  if (authUser.error || !authUser.user) {
    return jsonError("Authentication required", 401);
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const type = typeof body.type === "string" ? body.type : "system";
    const title = typeof body.title === "string" ? body.title : "Notice";
    const message = typeof body.message === "string" ? body.message : "";
    const profileId = body.profile_id;
    const targetProfileId = typeof profileId === "string" ? profileId : authUser.user.id;

    const { error } = await supabaseAdmin.from("communication_notifications").insert({
      profile_id: targetProfileId,
      type,
      title,
      message,
      priority: typeof body.priority === "string" ? body.priority : "normal",
      related_type: typeof body.related_type === "string" ? body.related_type : null,
      related_id: typeof body.related_id === "string" ? body.related_id : null,
      metadata: typeof body.metadata === "object" && body.metadata ? body.metadata : {},
    });

    if (error) {
      return jsonError(error.message || "Failed to create notification", 500);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/communications error", error);
    return jsonError(error instanceof Error ? error.message : "Unable to create communication entry", 500);
  }
}
