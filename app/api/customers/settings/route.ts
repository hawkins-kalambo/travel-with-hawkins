import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuthenticatedUser } from "@/lib/supabaseServer";
import {
  getCustomerPreferences,
  getCustomerSettings,
  updateCustomerPreferences,
  updateCustomerSettings,
} from "@/lib/customerAuthAdmin";

// The frontend deals in one flat, camelCase settings object; underneath it's
// split across customer_settings and customer_preferences (see
// db/migrations/customer_authentication_system.sql). This route is the only
// place that needs to know about that split.
const SETTINGS_DEFAULTS = {
  emailNotifications: true,
  profileVisibility: "private" as "private" | "public",
  showBookingHistory: true,
  newsletterSubscription: true,
  promotionalEmails: true,
  twoFactorEnabled: false,
};

const PREFERENCES_DEFAULTS = {
  notifyBookingConfirmed: true,
  notifyTripReminder: true,
  notifyAnnouncements: true,
};

export async function GET(req: NextRequest) {
  const response = NextResponse.next();
  const authResult = await requireAuthenticatedUser(req, response);

  if (authResult.error || !authResult.user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const customerId = authResult.user.id;
  const [settingsRow, preferencesRow] = await Promise.all([
    getCustomerSettings(customerId),
    getCustomerPreferences(customerId),
  ]);

  return NextResponse.json({
    success: true,
    settings: {
      emailNotifications: settingsRow?.email_notifications ?? SETTINGS_DEFAULTS.emailNotifications,
      profileVisibility: settingsRow?.profile_visibility ?? SETTINGS_DEFAULTS.profileVisibility,
      showBookingHistory: settingsRow?.show_booking_history ?? SETTINGS_DEFAULTS.showBookingHistory,
      newsletterSubscription: settingsRow?.newsletter_subscription ?? SETTINGS_DEFAULTS.newsletterSubscription,
      promotionalEmails: settingsRow?.promotional_emails ?? SETTINGS_DEFAULTS.promotionalEmails,
      twoFactorEnabled: settingsRow?.two_factor_enabled ?? SETTINGS_DEFAULTS.twoFactorEnabled,
      notifyBookingConfirmed: preferencesRow?.notify_booking_confirmed ?? PREFERENCES_DEFAULTS.notifyBookingConfirmed,
      notifyTripReminder: preferencesRow?.notify_trip_reminder ?? PREFERENCES_DEFAULTS.notifyTripReminder,
      notifyAnnouncements: preferencesRow?.notify_announcements ?? PREFERENCES_DEFAULTS.notifyAnnouncements,
    },
  });
}

export async function PATCH(req: NextRequest) {
  const response = NextResponse.next();
  const authResult = await requireAuthenticatedUser(req, response);

  if (authResult.error || !authResult.user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const customerId = authResult.user.id;
  const body = await req.json().catch(() => ({}));

  const settingsUpdate: Record<string, unknown> = {};
  if (typeof body.emailNotifications === "boolean") settingsUpdate.email_notifications = body.emailNotifications;
  if (body.profileVisibility === "public" || body.profileVisibility === "private") settingsUpdate.profile_visibility = body.profileVisibility;
  if (typeof body.showBookingHistory === "boolean") settingsUpdate.show_booking_history = body.showBookingHistory;
  if (typeof body.newsletterSubscription === "boolean") settingsUpdate.newsletter_subscription = body.newsletterSubscription;
  if (typeof body.promotionalEmails === "boolean") settingsUpdate.promotional_emails = body.promotionalEmails;
  if (typeof body.twoFactorEnabled === "boolean") settingsUpdate.two_factor_enabled = body.twoFactorEnabled;

  const preferencesUpdate: Record<string, unknown> = {};
  if (typeof body.notifyBookingConfirmed === "boolean") preferencesUpdate.notify_booking_confirmed = body.notifyBookingConfirmed;
  if (typeof body.notifyTripReminder === "boolean") preferencesUpdate.notify_trip_reminder = body.notifyTripReminder;
  if (typeof body.notifyAnnouncements === "boolean") preferencesUpdate.notify_announcements = body.notifyAnnouncements;

  if (Object.keys(settingsUpdate).length > 0) {
    const result = await updateCustomerSettings(customerId, settingsUpdate);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error || "Failed to save settings" }, { status: 500 });
    }
  }

  if (Object.keys(preferencesUpdate).length > 0) {
    const result = await updateCustomerPreferences(customerId, preferencesUpdate);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error || "Failed to save preferences" }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
