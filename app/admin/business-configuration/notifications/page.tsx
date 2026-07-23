"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadBusinessSettings, saveBusinessSettings } from "@/app/admin/business-configuration/businessConfigClient";

const defaultNotificationSettings = {
  sendBookingConfirmation: true,
  sendAdminAlerts: true,
  bookingConfirmationTemplate: "default",
  paymentReminderDays: 3,
};

export default function NotificationsConfigPage() {
  const [settings, setSettings] = useState<Record<string, unknown>>({ notification_settings: defaultNotificationSettings });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const loaded = await loadBusinessSettings();
        setSettings({ notification_settings: { ...defaultNotificationSettings, ...(loaded.notification_settings ?? {}) } });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };
    void load();
  }, []);

  const updateField = (key: string, value: unknown) => {
    setSettings((prev) => ({
      notification_settings: {
        ...(prev.notification_settings as Record<string, unknown>),
        [key]: value,
      },
    }));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const payload = {
        notificationSettings: {
          ...defaultNotificationSettings,
          ...(settings.notification_settings as Record<string, unknown>),
        },
      };
      await saveBusinessSettings(payload);
      setMessage("Notification settings saved successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
      window.setTimeout(() => setMessage(null), 3000);
    }
  };

  const notificationSettings = settings.notification_settings as Record<string, unknown>;

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#0f3f78]">Notifications</p>
              <h1 className="text-3xl font-black text-slate-900">Manage notification defaults</h1>
              <p className="mt-2 text-sm text-slate-500">Control which notifications are sent and when reminders are triggered.</p>
            </div>
            <Link
              href="/admin/business-configuration"
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Back to Business Configuration
            </Link>
          </div>
        </div>

        {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{message}</div>}
        {error && <div className="rounded-2xl border border-danger/20 bg-danger/10 p-4 text-sm text-danger">{error}</div>}

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-6">
            <label className="grid gap-2 text-sm text-slate-700">
              <span className="font-semibold">Send booking confirmations</span>
              <select
                value={String(notificationSettings.sendBookingConfirmation ?? true)}
                onChange={(e) => updateField("sendBookingConfirmation", e.target.value === "true")}
                className="input-field w-full"
              >
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>

            <label className="grid gap-2 text-sm text-slate-700">
              <span className="font-semibold">Send admin alerts</span>
              <select
                value={String(notificationSettings.sendAdminAlerts ?? true)}
                onChange={(e) => updateField("sendAdminAlerts", e.target.value === "true")}
                className="input-field w-full"
              >
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>

            <label className="grid gap-2 text-sm text-slate-700">
              <span className="font-semibold">Booking confirmation template</span>
              <select
                value={String(notificationSettings.bookingConfirmationTemplate ?? "default")}
                onChange={(e) => updateField("bookingConfirmationTemplate", e.target.value)}
                className="input-field w-full"
              >
                <option value="default">Default</option>
                <option value="custom">Custom</option>
              </select>
            </label>

            <label className="grid gap-2 text-sm text-slate-700">
              <span className="font-semibold">Payment reminder days</span>
              <input
                type="number"
                min="0"
                value={String(notificationSettings.paymentReminderDays ?? 3)}
                onChange={(e) => updateField("paymentReminderDays", Number(e.target.value))}
                className="input-field w-full"
              />
            </label>
          </div>

          <div className="mt-6 flex gap-3 flex-wrap">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-[#0f3f78] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0a2d56] disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save notification settings"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
