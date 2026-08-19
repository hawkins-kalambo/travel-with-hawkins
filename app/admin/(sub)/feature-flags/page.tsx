"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/auth";
import PageHeader from "@/app/components/ui/PageHeader";
import Card from "@/app/components/ui/Card";
import Badge from "@/app/components/ui/Badge";

type FeatureFlag = {
  key: string;
  enabled: boolean;
  description: string | null;
  updatedAt: string | null;
};

const FLAG_LABELS: Record<string, string> = {
  student_booking_enabled: "Student & custom-destination booking",
  public_intercity_enabled: "Public intercity route booking",
  taxi_enabled: "Taxi booking",
  car_hire_enabled: "Car hire booking",
  operator_intercity_portal_enabled: "Operator intercity portal",
  multi_operator_comparison_enabled: "Multi-operator comparison",
  wave1_multi_corridor_launch_enabled: "Wave 1 multi-corridor public launch",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function FeatureFlagsPage() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [togglingKey, setTogglingKey] = useState<string | null>(null);

  const loadFlags = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await authFetch("/api/admin/feature-flags");
      const result = await response.json();
      if (!result.success) {
        setError(result.error || "Unable to load feature flags");
        return;
      }
      setFlags(result.flags);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load feature flags");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadFlags();
  }, []);

  const toggleFlag = async (flag: FeatureFlag) => {
    const nextEnabled = !flag.enabled;
    const verb = nextEnabled ? "enable" : "disable";
    if (!window.confirm(`${verb === "enable" ? "Enable" : "Disable"} "${FLAG_LABELS[flag.key] ?? flag.key}" marketplace-wide?`)) return;

    setError("");
    setTogglingKey(flag.key);
    try {
      const response = await authFetch("/api/admin/feature-flags", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: flag.key, enabled: nextEnabled }),
      });
      const result = await response.json();
      if (!result.success) {
        setError(result.error || "Unable to update feature flag");
        return;
      }
      await loadFlags();
    } finally {
      setTogglingKey(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Launch safety"
        title="Feature flags"
        description="Server-controlled kill switches enforced in the booking API itself, not just the UI. Disabling a live-service flag immediately rejects new bookings of that type with a customer-safe message."
      />

      {error && <div className="rounded-2xl border border-danger/20 bg-danger/10 p-4 text-sm text-danger">{error}</div>}
      {loading && <p className="text-sm text-gray-500">Loading…</p>}

      <div className="space-y-3">
        {flags.map((flag) => (
          <Card key={flag.key}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-gray-800">{FLAG_LABELS[flag.key] ?? flag.key}</p>
                <p className="text-xs text-gray-500">{flag.key}</p>
                {flag.description && <p className="mt-1 text-sm text-gray-600">{flag.description}</p>}
                <p className="mt-1 text-xs text-gray-400">Last updated: {formatDate(flag.updatedAt)}</p>
              </div>
              <div className="flex items-center gap-3">
                <Badge tone={flag.enabled ? "success" : "neutral"}>{flag.enabled ? "Enabled" : "Disabled"}</Badge>
                <button
                  onClick={() => void toggleFlag(flag)}
                  disabled={togglingKey === flag.key}
                  className="btn-secondary"
                >
                  {togglingKey === flag.key ? "Saving…" : flag.enabled ? "Disable" : "Enable"}
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
