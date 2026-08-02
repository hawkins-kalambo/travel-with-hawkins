import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type CommunicationNotificationPriority = "low" | "normal" | "high";

// Kept to exactly the set of types publishCommunicationEvent actually
// produces below — a prior version declared several values
// (ambassador_approved, ambassador_suspended, commission_generated,
// password_reset, system_message) that no code path ever emitted.
export type CommunicationNotificationType =
  | "ambassador_rejected"
  | "booking_created"
  | "booking_cancelled"
  | "commission_approved"
  | "commission_paid"
  | "referral_linked"
  | "new_application"
  | "application_approved"
  | "profile_updated"
  | "support_ticket_assigned"
  | "support_ticket_created";

export interface CreateCommunicationNotificationParams {
  profile_id: string;
  type: CommunicationNotificationType;
  title: string;
  message: string;
  priority?: CommunicationNotificationPriority;
  related_type?: string | null;
  related_id?: string | null;
  metadata?: Record<string, unknown>;
}

export type CommunicationEventType =
  | "application_approved"
  | "application_rejected"
  | "commission_approved"
  | "commission_paid"
  | "booking_confirmed"
  | "booking_cancelled"
  | "support_ticket_created"
  | "support_ticket_assigned"
  | "new_application"
  | "referral_booked"
  | "profile_updated";

export interface CommunicationEvent {
  type: CommunicationEventType;
  actor_id?: string;
  payload: Record<string, unknown>;
}

export async function getAdminProfileIds(): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .in("role", ["admin", "super_admin"]);

  if (error) {
    console.warn("Failed to fetch admin profile ids", error);
    return [];
  }

  if (!Array.isArray(data)) return [];
  return data
    .map((row) => {
      if (typeof row !== "object" || row === null || !("id" in row)) return "";
      return String((row as { id?: unknown }).id ?? "").trim();
    })
    .filter(Boolean);
}

export async function createCommunicationNotification(params: CreateCommunicationNotificationParams): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from("communication_notifications").insert({
      profile_id: params.profile_id,
      type: params.type,
      title: params.title,
      message: params.message,
      priority: params.priority || "normal",
      related_type: params.related_type || null,
      related_id: params.related_id || null,
      metadata: params.metadata || {},
    });

    if (error) {
      if (
        error.message?.includes("relation") ||
        error.message?.includes("does not exist") ||
        error.message?.includes("communication_notifications")
      ) {
        console.debug("communication_notifications table not available yet", error.message);
      } else {
        console.warn("Failed to create communication notification", error);
      }
    }
  } catch (err) {
    console.debug("createCommunicationNotification error", err instanceof Error ? err.message : String(err));
  }
}

export async function createBulkCommunicationNotifications(
  params: Omit<CreateCommunicationNotificationParams, "profile_id">[],
  profileIds: string[]
): Promise<void> {
  if (profileIds.length === 0 || params.length === 0) return;

  const notifications = profileIds.flatMap((profile_id) =>
    params.map((param) => ({
      ...param,
      profile_id,
    }))
  );

  try {
    const { error } = await supabaseAdmin.from("communication_notifications").insert(notifications);
    if (error) {
      if (
        error.message?.includes("relation") ||
        error.message?.includes("does not exist") ||
        error.message?.includes("communication_notifications")
      ) {
        console.debug("communication_notifications table not available yet", error.message);
      } else {
        console.warn("Failed to create bulk communication notifications", error);
      }
    }
  } catch (err) {
    console.debug("createBulkCommunicationNotifications error", err instanceof Error ? err.message : String(err));
  }
}

export async function publishCommunicationEvent(event: CommunicationEvent): Promise<void> {
  switch (event.type) {
    case "application_approved": {
      const profileId = String(event.payload.profile_id || event.payload.ambassador_id || "");
      const applicationId = String(event.payload.application_id || event.payload.applicationId || "");
      const referralCode = String(event.payload.referral_code || event.payload.referralCode || "");

      if (!profileId) return;

      await createCommunicationNotification({
        profile_id: profileId,
        type: "application_approved",
        title: "Application Approved 🎉",
        message: `Your application has been approved. Your referral code is ${referralCode}.`,
        priority: "high",
        related_type: "ambassador_applications",
        related_id: applicationId || null,
        metadata: { referral_code: referralCode },
      });
      return;
    }
    case "application_rejected": {
      const profileId = String(event.payload.profile_id || event.payload.ambassador_id || "");
      const reason = String(event.payload.reason || event.payload.rejectionReason || "");
      if (!profileId) return;

      await createCommunicationNotification({
        profile_id: profileId,
        type: "ambassador_rejected",
        title: "Application Rejected",
        message: `Your ambassador application was not approved.${reason ? ` Reason: ${reason}` : ""}`,
        priority: "normal",
        related_type: "ambassador_applications",
        related_id: String(event.payload.application_id || event.payload.applicationId || "") || null,
      });
      return;
    }
    case "commission_approved":
    case "commission_paid": {
      // Defense-in-depth: the caller (app/api/commissions/route.ts) always
      // resolves and passes the real profile_id today, but this used to
      // silently fall back to `ambassador_id` — the `ambassadors.id`
      // surrogate key, which is never equal to a `profiles.id`/auth user
      // id — meaning every commission notification was written under a
      // profile_id no session would ever match. If a future caller ever
      // makes that same mistake again, resolve it properly here instead
      // of repeating the bug.
      let profileId = String(event.payload.profile_id || "");
      if (!profileId && event.payload.ambassador_id) {
        const { data: ambassadorRow } = await supabaseAdmin
          .from("ambassadors")
          .select("user_id, profile_id")
          .eq("id", String(event.payload.ambassador_id))
          .maybeSingle();
        profileId = String(ambassadorRow?.user_id || ambassadorRow?.profile_id || "");
      }
      const amount = Number(event.payload.commission_amount ?? 0);
      const bookingId = String(event.payload.booking_id || event.payload.bookingId || "");
      if (!profileId) return;

      await createCommunicationNotification({
        profile_id: profileId,
        type: event.type === "commission_approved" ? "commission_approved" : "commission_paid",
        title: event.type === "commission_approved" ? "Commission Approved ✓" : "Commission Paid 💰",
        message:
          event.type === "commission_approved"
            ? `A commission of ${amount.toLocaleString()} has been approved for booking ${bookingId}.`
            : `Your commission of ${amount.toLocaleString()} has been paid.`,
        priority: event.type === "commission_paid" ? "high" : "normal",
        related_type: "referrals",
        related_id: String(event.payload.referral_id || event.payload.referralId || "") || null,
        metadata: { commission_amount: amount, booking_id: bookingId },
      });
      return;
    }
    case "booking_confirmed":
    case "booking_cancelled": {
      const profileId = String(event.payload.profile_id || event.payload.ambassador_id || "");
      const bookingId = String(event.payload.booking_id || event.payload.bookingId || "");
      if (!profileId) return;

      await createCommunicationNotification({
        profile_id: profileId,
        type: event.type === "booking_confirmed" ? "booking_created" : "booking_cancelled",
        title: event.type === "booking_confirmed" ? "Booking Confirmed" : "Booking Cancelled",
        message:
          event.type === "booking_confirmed"
            ? `Booking ${bookingId} has been confirmed.`
            : `Booking ${bookingId} has been cancelled.`,
        priority: "normal",
        related_type: "bookings",
        related_id: bookingId || null,
        metadata: { booking_id: bookingId },
      });
      return;
    }
    case "support_ticket_created": {
      const requesterId = String(event.payload.requester_id || event.payload.profile_id || "");
      if (!requesterId) return;
      const assigneeIds = Array.isArray(event.payload.assignee_ids) ? event.payload.assignee_ids.map(String).filter(Boolean) : [];
      const ticketId = String(event.payload.ticket_id || event.payload.ticketId || "");
      const subject = String(event.payload.subject || "Support ticket created");

      await createCommunicationNotification({
        profile_id: requesterId,
        type: "support_ticket_created",
        title: "Support ticket opened",
        message: `Your ticket '${subject}' has been created.`,
        priority: "normal",
        related_type: "support_tickets",
        related_id: ticketId || null,
        metadata: { subject },
      });

      if (assigneeIds.length > 0) {
        await createBulkCommunicationNotifications(
          [
            {
              type: "support_ticket_assigned",
              title: "Ticket assigned",
              message: `A support ticket '${subject}' has been assigned to you.`,
              priority: "normal",
              related_type: "support_tickets",
              related_id: ticketId || null,
              metadata: { subject },
            },
          ],
          assigneeIds
        );
      }
      return;
    }
    case "support_ticket_assigned": {
      const assigneeId = String(event.payload.assignee_id || event.payload.profile_id || "");
      const ticketId = String(event.payload.ticket_id || event.payload.ticketId || "");
      const subject = String(event.payload.subject || "Support ticket assigned");
      if (!assigneeId) return;

      await createCommunicationNotification({
        profile_id: assigneeId,
        type: "support_ticket_assigned",
        title: "Ticket assigned",
        message: `You have been assigned ticket ${subject}.`,
        priority: "normal",
        related_type: "support_tickets",
        related_id: ticketId || null,
        metadata: { subject },
      });
      return;
    }
    case "new_application": {
      const adminIds = await getAdminProfileIds();
      const applicantName = String(event.payload.full_name || event.payload.name || "Applicant");
      const applicationId = String(event.payload.application_id || event.payload.applicationId || "");
      if (adminIds.length === 0) return;

      await createBulkCommunicationNotifications(
        [
          {
            type: "new_application",
            title: "New ambassador application",
            message: `${applicantName} submitted a new application.`,
            priority: "high",
            related_type: "ambassador_applications",
            related_id: applicationId || null,
            metadata: { applicant_name: applicantName },
          },
        ],
        adminIds
      );
      return;
    }
    case "referral_booked": {
      const profileIds = Array.isArray(event.payload.profile_ids)
        ? event.payload.profile_ids.map(String).filter(Boolean)
        : [];
      const bookingId = String(event.payload.booking_id || event.payload.bookingId || "");
      if (profileIds.length === 0) return;

      await createBulkCommunicationNotifications(
        [
          {
            type: "referral_linked",
            title: "Referral booking received",
            message: `A referral booking ${bookingId} has been received.`,
            priority: "normal",
            related_type: "referrals",
            related_id: bookingId || null,
            metadata: { booking_id: bookingId },
          },
        ],
        profileIds
      );
      return;
    }
    case "profile_updated": {
      const profileId = String(event.payload.profile_id || event.payload.profileId || "");
      if (!profileId) return;

      await createCommunicationNotification({
        profile_id: profileId,
        type: "profile_updated",
        title: "Profile updated",
        message: "Your profile information was updated successfully.",
        priority: "low",
        related_type: "profiles",
        related_id: profileId,
      });
      return;
    }
    default:
      console.warn("Unhandled communication event type", event.type);
  }
}
