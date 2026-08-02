"use client";

import { useEffect, useState } from "react";
import { loadBusinessSettings, saveBusinessSettings } from "@/app/admin/(sub)/business-configuration/businessConfigClient";
import PageHeader from "@/app/components/ui/PageHeader";
import Card from "@/app/components/ui/Card";
import Button from "@/app/components/ui/Button";
import { LoadingState } from "@/app/components/ui/Spinner";

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const loaded = await loadBusinessSettings();
        setSettings({ referral_program: { ...defaultReferral, ...(loaded.referral_program ?? {}) } });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        window.setTimeout(() => setError(null), 4000);
      } finally {
        setLoading(false);
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
      window.setTimeout(() => setError(null), 4000);
    } finally {
      setSaving(false);
      window.setTimeout(() => setMessage(null), 3000);
    }
  };

  const referralProgram = settings.referral_program as Record<string, unknown>;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Referral program"
        title="Configure referral workflow and commission rules"
        description="Control how referrals behave for students and ambassadors across the platform."
        actions={<Button href="/admin/business-configuration" variant="secondary">Back to business configuration</Button>}
      />

      {message && <div className="rounded-2xl border border-success/20 bg-success/10 p-4 text-sm text-success">{message}</div>}
      {error && <div className="rounded-2xl border border-danger/20 bg-danger/10 p-4 text-sm text-danger">{error}</div>}

      {loading ? (
        <Card>
          <LoadingState label="Loading referral program settings…" />
        </Card>
      ) : (
        <Card>
          <div className="grid gap-6">
            <label className="grid gap-2 text-sm text-gray-700">
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

            <label className="grid gap-2 text-sm text-gray-700">
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

            <label className="grid gap-2 text-sm text-gray-700">
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

            <label className="grid gap-2 text-sm text-gray-700">
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
              <label className="grid gap-2 text-sm text-gray-700">
                <span className="font-semibold">Referral code length</span>
                <input
                  type="number"
                  min="4"
                  value={String(referralProgram.referralCodeLength ?? 6)}
                  onChange={(e) => updateField("referralCodeLength", Number(e.target.value))}
                  className="input-field w-full"
                />
              </label>
              <label className="grid gap-2 text-sm text-gray-700">
                <span className="font-semibold">Referral code prefix</span>
                <input
                  value={String(referralProgram.referralCodePrefix ?? "ENG2026")}
                  onChange={(e) => updateField("referralCodePrefix", e.target.value)}
                  className="input-field w-full"
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm text-gray-700">
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
              <label className="grid gap-2 text-sm text-gray-700">
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

            <label className="grid gap-2 text-sm text-gray-700">
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
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save referral settings"}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
