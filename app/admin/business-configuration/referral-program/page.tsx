"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadBusinessSettings, saveBusinessSettings } from "@/app/admin/business-configuration/businessConfigClient";

const defaultReferral = {
  enabled: true,
  allowReferralWithoutLogin: false,
  requireAmbassadorApproval: false,
  defaultAmbassadorStatus: "active",
  referralCodeLength: 6,
  referralCodePrefix: "ENG2026",
  maxReferralsPerStudent: "",
  minimumBookingValue: 0,
  defaultCommissionStatus: "pending",
};

export default function ReferralProgramPage() {
  const [settings, setSettings] = useState<Record<string, unknown>>({ referral_program: defaultReferral });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const loaded = await loadBusinessSettings();
        setSettings({ referral_program: { ...defaultReferral, ...(loaded.referral_program ?? {}) } });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };
    void load();
  }, []);

  const updateField = (key: string, value: unknown) => {
    setSettings((prev) => ({
      referral_program: {
        ...(prev.referral_program as Record<string, unknown>),
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
        referralProgram: {
          ...defaultReferral,
          ...(settings.referral_program as Record<string, unknown>),
        },
      };
      await saveBusinessSettings(payload);
      setMessage("Referral program settings saved successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
      window.setTimeout(() => setMessage(null), 3000);
    }
  };

  const referralProgram = settings.referral_program as Record<string, unknown>;

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#0f3f78]">Referral Program</p>
              <h1 className="text-3xl font-black text-slate-900">Configure referral workflow and commission rules</h1>
              <p className="mt-2 text-sm text-slate-500">Control how referrals behave for students and ambassadors across the platform.</p>
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
              <span className="font-semibold">Referral Program Enabled</span>
              <select
                value={String(referralProgram.enabled ?? true)}
                onChange={(e) => updateField("enabled", e.target.value === "true")}
                className="input-field w-full"
              >
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
              </select>
            </label>

            <label className="grid gap-2 text-sm text-slate-700">
              <span className="font-semibold">Allow referral without login</span>
              <select
                value={String(referralProgram.allowReferralWithoutLogin ?? false)}
                onChange={(e) => updateField("allowReferralWithoutLogin", e.target.value === "true")}
                className="input-field w-full"
              >
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>

            <label className="grid gap-2 text-sm text-slate-700">
              <span className="font-semibold">Require ambassador approval</span>
              <select
                value={String(referralProgram.requireAmbassadorApproval ?? false)}
                onChange={(e) => updateField("requireAmbassadorApproval", e.target.value === "true")}
                className="input-field w-full"
              >
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>

            <label className="grid gap-2 text-sm text-slate-700">
              <span className="font-semibold">Default ambassador status</span>
              <select
                value={String(referralProgram.defaultAmbassadorStatus ?? "active")}
                onChange={(e) => updateField("defaultAmbassadorStatus", e.target.value)}
                className="input-field w-full"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm text-slate-700">
                <span className="font-semibold">Referral code length</span>
                <input
                  type="number"
                  min="4"
                  value={String(referralProgram.referralCodeLength ?? 6)}
                  onChange={(e) => updateField("referralCodeLength", Number(e.target.value))}
                  className="input-field w-full"
                />
              </label>
              <label className="grid gap-2 text-sm text-slate-700">
                <span className="font-semibold">Referral code prefix</span>
                <input
                  value={String(referralProgram.referralCodePrefix ?? "ENG2026")}
                  onChange={(e) => updateField("referralCodePrefix", e.target.value)}
                  className="input-field w-full"
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm text-slate-700">
                <span className="font-semibold">Maximum referrals per student</span>
                <input
                  type="number"
                  min="0"
                  value={String(referralProgram.maxReferralsPerStudent ?? "")}
                  onChange={(e) => updateField("maxReferralsPerStudent", e.target.value ? Number(e.target.value) : "")}
                  className="input-field w-full"
                  placeholder="Optional"
                />
              </label>
              <label className="grid gap-2 text-sm text-slate-700">
                <span className="font-semibold">Minimum booking value for commission</span>
                <input
                  type="number"
                  min="0"
                  value={String(referralProgram.minimumBookingValue ?? 0)}
                  onChange={(e) => updateField("minimumBookingValue", Number(e.target.value))}
                  className="input-field w-full"
                />
              </label>
            </div>

            <label className="grid gap-2 text-sm text-slate-700">
              <span className="font-semibold">Default commission status</span>
              <select
                value={String(referralProgram.defaultCommissionStatus ?? "pending")}
                onChange={(e) => updateField("defaultCommissionStatus", e.target.value)}
                className="input-field w-full"
              >
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="paid">Paid</option>
              </select>
            </label>
          </div>

          <div className="mt-6 flex gap-3 flex-wrap">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-[#0f3f78] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0a2d56] disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save referral settings"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
