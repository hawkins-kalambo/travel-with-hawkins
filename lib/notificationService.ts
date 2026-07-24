import { createCommunicationNotification, createBulkCommunicationNotifications } from "@/lib/communicationEngine";

export type NotificationType =
  | "ambassador_approved"
  | "ambassador_suspended"
  | "ambassador_rejected"
  | "booking_created"
  | "booking_cancelled"
  | "commission_generated"
  | "commission_approved"
  | "commission_paid"
  | "referral_linked"
  | "password_reset"
  | "new_application"
  | "application_approved"
  | "profile_updated"
  | "system_message";

export interface CreateNotificationParams {
  profile_id: string;
  type: NotificationType;
  title: string;
  message: string;
  priority?: "low" | "normal" | "high";
  related_type?: string;
  related_id?: string;
  metadata?: Record<string, unknown>;
}

export async function createNotification(params: CreateNotificationParams): Promise<void> {
  await createCommunicationNotification(params);
}

export async function createBulkNotifications(params: Omit<CreateNotificationParams, "profile_id">[], profileIds: string[]): Promise<void> {
  await createBulkCommunicationNotifications(params, profileIds);
}
