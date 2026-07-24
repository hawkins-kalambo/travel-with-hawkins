import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type ProfileSummary = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  role?: string | null;
};

export async function getProfileSummary(profileId: string): Promise<ProfileSummary | null> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("id", profileId)
    .maybeSingle();

  if (error) {
    console.warn("Failed to load profile summary", error);
    return null;
  }

  return data ?? null;
}

export async function getAnnouncementsForRole(role: string): Promise<unknown[]> {
  const audiences = ["everyone"];
  if (role === "admin" || role === "super_admin") audiences.push("admins");
  if (role === "ambassador") audiences.push("ambassadors");

  const { data, error } = await supabaseAdmin
    .from("communication_announcements")
    .select("id, title, body, audience, pinned, published_at, expires_at")
    .in("audience", audiences)
    .order("pinned", { ascending: false })
    .order("published_at", { ascending: false })
    .limit(5);

  if (error) {
    console.warn("Failed to load announcements for role", error);
    return [];
  }

  return data ?? [];
}

export async function getConversationSummary(profileId: string): Promise<unknown[]> {
  const { data, error } = await supabaseAdmin
    .from("communication_conversation_participants")
    .select(
      "conversation_id, starred, archived, last_read_at, communication_conversations(id, title, conversation_type, updated_at)"
    )
    .eq("profile_id", profileId)
    .eq("deleted", false)
    .order("communication_conversations.updated_at", { ascending: false })
    .limit(5);

  if (error) {
    console.warn("Failed to load conversation summary", error);
    return [];
  }

  return data ?? [];
}

export async function getNotificationSummary(profileId: string): Promise<unknown[]> {
  const { data, error } = await supabaseAdmin
    .from("communication_notifications")
    .select("id, type, title, message, priority, read_at, related_type, related_id, created_at")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    console.warn("Failed to load notifications summary", error);
    return [];
  }

  return data ?? [];
}

export async function getTicketSummary(profileId: string, isAdmin: boolean): Promise<unknown[]> {
  const query = supabaseAdmin
    .from("communication_support_tickets")
    .select("id, subject, category, status, priority, created_at")
    .in("status", ["open", "assigned", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(5);

  if (!isAdmin) {
    query.eq("requester_id", profileId);
  }

  const { data, error } = await query;
  if (error) {
    console.warn("Failed to load ticket summary", error);
    return [];
  }

  return data ?? [];
}

export async function getSummaryCounts(profileId: string, isAdmin: boolean) {
  const [notificationCountResult, unreadCountResult, conversationCountResult, ticketCountResult] = await Promise.all([
    supabaseAdmin.from("communication_notifications").select("id", { count: "exact", head: true }).eq("profile_id", profileId),
    supabaseAdmin.from("communication_notifications").select("id", { count: "exact", head: true }).eq("profile_id", profileId).is("read_at", null),
    supabaseAdmin.from("communication_conversation_participants").select("id", { count: "exact", head: true }).eq("profile_id", profileId).eq("deleted", false),
    (async () => {
      const query = supabaseAdmin.from("communication_support_tickets").select("id", { count: "exact", head: true }).in("status", ["open", "assigned", "in_progress"]);
      if (!isAdmin) query.eq("requester_id", profileId);
      return query;
    })(),
  ]);

  return {
    notifications: notificationCountResult.count ?? 0,
    unreadNotifications: unreadCountResult.count ?? 0,
    conversations: conversationCountResult.count ?? 0,
    openTickets: ticketCountResult.count ?? 0,
  };
}

export async function isConversationParticipant(profileId: string, conversationId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("communication_conversation_participants")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("profile_id", profileId)
    .eq("deleted", false)
    .maybeSingle();

  if (error) {
    console.warn("Failed to verify conversation participant", error);
    return false;
  }

  return Boolean(data);
}

export async function getConversationMessages(conversationId: string) {
  const { data, error } = await supabaseAdmin
    .from("communication_messages")
    .select("id, sender_id, body, html, attachments, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) {
    console.warn("Failed to load conversation messages", error);
    return [];
  }

  return data ?? [];
}
