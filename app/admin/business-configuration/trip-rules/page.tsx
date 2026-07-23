"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadBusinessSettings, saveBusinessSettings } from "@/app/admin/business-configuration/businessConfigClient";

const defaultTripRules = {
  allow_same_day_booking: false,
  require_deposit: true,
  deposit_percentage: 20,
  max_passengers_per_booking: 10,
  cancellation_policy_days: 2,
  cancellation_fee_percentage: 10,
};

export default function TripRulesConfigPage() {
  const [settings, setSettings] = useState<Record<string, unknown>>({ trip_rules: defaultTripRules });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const loaded = await loadBusinessSettings();
        setSettings({ trip_rules: { ...defaultTripRules, ...(loaded.trip_rules ?? {}) } });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };
    void load();
  }, []);

  const updateField = (key: string, value: unknown) => {
    setSettings((prev) => ({
      trip_rules: {
        ...(prev.trip_rules as Record<string, unknown>),
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
        tripRules: {
          ...defaultTripRules,
          ...(settings.trip_rules as Record<string, unknown>),
        },
      };
      await saveBusinessSettings(payload);
      setMessage("Trip rule settings saved successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
      window.setTimeout(() => setMessage(null), 3000);
    }
  };

  const tripRules = settings.trip_rules as Record<string, unknown>;

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#0f3f78]">Trip Rules</p>
              <h1 className="text-3xl font-black text-slate-900">Configure booking and trip rules</h1>
              <p className="mt-2 text-sm text-slate-500">Configure the booking experience with deposits, capacity rules, and cancellations.</p>
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
              <span className="font-semibold">Allow same-day booking</span>
              <select
                value={String(tripRules.allow_same_day_booking ?? false)}
                onChange={(e) => updateField("allow_same_day_booking", e.target.value === "true")}
                className="input-field w-full"
              >
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm text-slate-700">
                <span className="font-semibold">Require deposit</span>
                <select
                  value={String(tripRules.require_deposit ?? true)}
                  onChange={(e) => updateField("require_deposit", e.target.value === "true")}
                  className="input-field w-full"
                >
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm text-slate-700">
                <span className="font-semibold">Deposit percentage</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={String(tripRules.deposit_percentage ?? 20)}
                  onChange={(e) => updateField("deposit_percentage", Number(e.target.value))}
                  className="input-field w-full"
                />
              </label>
            </div>

            <label className="grid gap-2 text-sm text-slate-700">
              <span className="font-semibold">Maximum passengers per booking</span>
              <input
                type="number"
                min="1"
                value={String(tripRules.max_passengers_per_booking ?? 10)}
                onChange={(e) => updateField("max_passengers_per_booking", Number(e.target.value))}
                className="input-field w-full"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm text-slate-700">
                <span className="font-semibold">Cancellation notice days</span>
                <input
                  type="number"
                  min="0"
                  value={String(tripRules.cancellation_policy_days ?? 2)}
                  onChange={(e) => updateField("cancellation_policy_days", Number(e.target.value))}
                  className="input-field w-full"
                />
              </label>
              <label className="grid gap-2 text-sm text-slate-700">
                <span className="font-semibold">Cancellation fee percentage</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={String(tripRules.cancellation_fee_percentage ?? 10)}
                  onChange={(e) => updateField("cancellation_fee_percentage", Number(e.target.value))}
                  className="input-field w-full"
                />
              </label>
            </div>
          </div>

          <div className="mt-6 flex gap-3 flex-wrap">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-[#0f3f78] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0a2d56] disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save trip rules"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
