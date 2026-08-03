import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuthenticatedUser, requireAdminUser, resolveAdminRole } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hasPermission, normalizeAppRole } from "@/lib/permissions";
import { getAnnouncementsForRole } from "@/lib/communicationServer";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function getNotificationCategory(type: string) {
  const normalized = type.toLowerCase();
  if (normalized.includes("booking")) return "Booking";
  if (normalized.includes("payment") || normalized.includes("commission")) return "Payment";
  if (normalized.includes("referral")) return "Referral";
  if (normalized.includes("application") || normalized.includes("ambassador")) return "Ambassador";
  if (normalized.includes("ticket") || normalized.includes("support")) return "Support";
  if (normalized.includes("announcement")) return "Announcement";
  if (normalized.includes("profile") || normalized.includes("system")) return "System";
  return "System";
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

    // Resolved server-side from the admins/ambassadors/profiles tables —
    // never from user_metadata, which the token owner can set themselves.
    const role = normalizeAppRole(profileData?.role || (await resolveAdminRole(authUser.user)));
    const isAdmin = authorized || hasPermission(role, "manageReports");

    const [notificationsResult, conversationsResult, ticketsResult, announcementsResult] = await Promise.allSettled([
      supabaseAdmin
        .from("communication_notifications")
        .select("id, type, title, message, priority, read_at, related_type, related_id, metadata, created_at")
        .eq("profile_id", profileId)
        .order("created_at", { ascending: false })
        .limit(25),
      // Fixes a bug found while auditing the communications system:
      // ordering a parent query by a column on an embedded/nested resource
      // (`communication_conversations.updated_at`) isn't supported by
      // PostgREST — it was silently sorting by an unrelated same-named
      // column instead. Sorted client-side below.
      supabaseAdmin
        .from("communication_conversation_participants")
        .select("conversation_id, starred, archived, last_read_at, communication_conversations(id, title, conversation_type, updated_at)")
        .eq("profile_id", profileId)
        .eq("deleted", false)
        .limit(15),
      supabaseAdmin
        .from("communication_support_tickets")
        .select("id, subject, category, status, priority, created_at")
        .eq("requester_id", profileId)
        .order("created_at", { ascending: false })
        .limit(15),
      // Fixes a bug found while auditing the communications system: this
      // previously fetched every announcement regardless of `audience`,
      // meaning admin-only broadcasts were returned to (and, until the
      // ambassador page fix below, just never rendered for) every caller.
      // getAnnouncementsForRole() applies the same audience scoping the
      // admin composer UI offers (everyone/admins/ambassadors).
      Promise.resolve({ data: await getAnnouncementsForRole(role), error: null }),
    ]);

    const notifications = notificationsResult.status === "fulfilled" ? notificationsResult.value.data ?? [] : [];
    const rawConversations =
      conversationsResult.status === "fulfilled"
        ? ((conversationsResult.value.data ?? []) as unknown as Array<{ communication_conversations?: { updated_at?: string | null } | null }>)
        : [];
    const conversations = rawConversations
      .slice()
      .sort((a, b) => (b.communication_conversations?.updated_at || "").localeCompare(a.communication_conversations?.updated_at || ""));
    const tickets = ticketsResult.status === "fulfilled" ? ticketsResult.value.data ?? [] : [];
    const announcements = announcementsResult.status === "fulfilled" ? announcementsResult.value.data ?? [] : [];

    const unreadNotifications = notifications.filter((notification: { read_at?: string | null }) => !notification.read_at).length;
    const openSupportTickets = tickets.filter((ticket: { status?: string }) => {
      const status = String(ticket.status || "").toLowerCase();
      return ["open", "assigned", "in_progress", "pending"].includes(status);
    }).length;
    const pendingSupportTickets = tickets.filter((ticket: { status?: string }) => {
      const status = String(ticket.status || "").toLowerCase();
      return ["assigned", "in_progress", "pending", "waiting_for_customer"].includes(status);
    }).length;
    const publishedAnnouncements = announcements.filter((announcement: { published_at?: string | null }) => Boolean(announcement.published_at)).length;
    const scheduledAnnouncements = announcements.filter((announcement: { published_at?: string | null }) => !announcement.published_at).length;
    const deliveryRate = notifications.length > 0 ? Math.max(0, Math.min(100, Math.round(((notifications.length - unreadNotifications) / notifications.length) * 100))) : 100;

    const activityFeed = [
      ...notifications.slice(0, 6).map((notification: { id: string; title: string; message: string; created_at?: string }) => ({
        id: `notification-${notification.id}`,
        type: "notification",
        title: notification.title,
        description: notification.message,
        created_at: notification.created_at,
      })),
      ...tickets.slice(0, 6).map((ticket: { id: string; subject: string; status?: string; created_at?: string }) => ({
        id: `ticket-${ticket.id}`,
        type: "ticket",
        title: ticket.subject,
        description: `Ticket updated to ${ticket.status || "open"}`,
        created_at: ticket.created_at,
      })),
      ...announcements.slice(0, 6).map((announcement: { id: string; title: string; published_at?: string | null }) => ({
        id: `announcement-${announcement.id}`,
        type: "announcement",
        title: announcement.title,
        description: "Announcement published",
        created_at: announcement.published_at,
      })),
    ]
      .sort((left, right) => (right.created_at || "").localeCompare(left.created_at || ""))
      .slice(0, 10);

    return NextResponse.json({
      success: true,
      isAdmin,
      profile: profileData ?? null,
      notifications,
      conversations,
      tickets,
      announcements,
      metrics: {
        totalNotifications: notifications.length,
        unreadNotifications,
        totalConversations: conversations.length,
        activeConversations: conversations.length,
        openSupportTickets: openSupportTickets,
        pendingSupportTickets,
        scheduledAnnouncements,
        publishedAnnouncements,
        broadcastCampaigns: 0,
        messageDeliveryRate: deliveryRate,
        averageSupportResponseTime: "0m",
        categoryBreakdown: {
          booking: notifications.filter((notification: { type: string }) => getNotificationCategory(notification.type) === "Booking").length,
          support: notifications.filter((notification: { type: string }) => getNotificationCategory(notification.type) === "Support").length,
          announcement: notifications.filter((notification: { type: string }) => getNotificationCategory(notification.type) === "Announcement").length,
          system: notifications.filter((notification: { type: string }) => getNotificationCategory(notification.type) === "System").length,
        },
      },
      activityFeed,
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
    // Fixes a security gap found while auditing the communications system:
    // this endpoint previously let ANY authenticated user (customer,
    // ambassador) write an arbitrary notification — attacker-controlled
    // type/title/message/priority — into any OTHER user's inbox, just by
    // supplying a `profile_id` in the body. Only admins may target someone
    // other than themselves now.
    const { authorized: isAdminCaller } = await requireAdminUser(req, response);

    const body = (await req.json()) as Record<string, unknown>;
    const type = typeof body.type === "string" ? body.type : "system";
    const title = typeof body.title === "string" ? body.title : "Notice";
    const message = typeof body.message === "string" ? body.message : "";
    const requestedProfileId = typeof body.profile_id === "string" ? body.profile_id : undefined;
    const targetProfileId = isAdminCaller && requestedProfileId ? requestedProfileId : authUser.user.id;

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
