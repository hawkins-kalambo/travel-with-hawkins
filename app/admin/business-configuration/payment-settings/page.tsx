"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadBusinessSettings, saveBusinessSettings } from "@/app/admin/business-configuration/businessConfigClient";

const defaultPaymentSettings = {
  currency: "USD",
  paymentGateway: "stripe",
  requirePaymentBeforeBooking: true,
  allowOfflinePayment: false,
  paymentNotificationEmail: "",
};

export default function PaymentSettingsPage() {
  const [settings, setSettings] = useState<Record<string, unknown>>({ payment_settings: defaultPaymentSettings });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const loaded = await loadBusinessSettings();
        setSettings({ payment_settings: { ...defaultPaymentSettings, ...(loaded.payment_settings ?? {}) } });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };
    void load();
  }, []);

  const updateField = (key: string, value: unknown) => {
    setSettings((prev) => ({
      payment_settings: {
        ...(prev.payment_settings as Record<string, unknown>),
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
        paymentSettings: {
          ...defaultPaymentSettings,
          ...(settings.payment_settings as Record<string, unknown>),
        },
      };
      await saveBusinessSettings(payload);
      setMessage("Payment settings saved successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
      window.setTimeout(() => setMessage(null), 3000);
    }
  };

  const paymentSettings = settings.payment_settings as Record<string, unknown>;

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#0f3f78]">Payment Settings</p>
              <h1 className="text-3xl font-black text-slate-900">Configure payment and checkout options</h1>
              <p className="mt-2 text-sm text-slate-500">Manage currency, gateway preferences, and payment flow rules.</p>
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
              <span className="font-semibold">Currency</span>
              <input
                value={String(paymentSettings.currency ?? "USD")}
                onChange={(e) => updateField("currency", e.target.value)}
                className="input-field w-full"
              />
            </label>

            <label className="grid gap-2 text-sm text-slate-700">
              <span className="font-semibold">Payment gateway</span>
              <select
                value={String(paymentSettings.paymentGateway ?? "stripe")}
                onChange={(e) => updateField("paymentGateway", e.target.value)}
                className="input-field w-full"
              >
                <option value="stripe">Stripe</option>
                <option value="paypal">PayPal</option>
                <option value="manual">Manual / Offline</option>
              </select>
            </label>

            <label className="grid gap-2 text-sm text-slate-700">
              <span className="font-semibold">Require payment before booking</span>
              <select
                value={String(paymentSettings.requirePaymentBeforeBooking ?? true)}
                onChange={(e) => updateField("requirePaymentBeforeBooking", e.target.value === "true")}
                className="input-field w-full"
              >
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>

            <label className="grid gap-2 text-sm text-slate-700">
              <span className="font-semibold">Allow offline payments</span>
              <select
                value={String(paymentSettings.allowOfflinePayment ?? false)}
                onChange={(e) => updateField("allowOfflinePayment", e.target.value === "true")}
                className="input-field w-full"
              >
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>

            <label className="grid gap-2 text-sm text-slate-700">
              <span className="font-semibold">Payment notification email</span>
              <input
                value={String(paymentSettings.paymentNotificationEmail ?? "")}
                onChange={(e) => updateField("paymentNotificationEmail", e.target.value)}
                className="input-field w-full"
                placeholder="admin@example.com"
              />
            </label>
          </div>

          <div className="mt-6 flex gap-3 flex-wrap">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-[#0f3f78] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0a2d56] disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save payment settings"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
