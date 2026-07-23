"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadBusinessSettings, saveBusinessSettings } from "@/app/admin/business-configuration/businessConfigClient";

const defaultSystemPreferences = {
  defaultLanguage: "en",
  timezone: "UTC",
  enableMaintenanceMode: false,
  allowNewRegistrations: true,
};

export default function SystemPreferencesPage() {
  const [settings, setSettings] = useState<Record<string, unknown>>({ system_preferences: defaultSystemPreferences });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const loaded = await loadBusinessSettings();
        setSettings({ system_preferences: { ...defaultSystemPreferences, ...(loaded.system_preferences ?? {}) } });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };
    void load();
  }, []);

  const updateField = (key: string, value: unknown) => {
    setSettings((prev) => ({
      system_preferences: {
        ...(prev.system_preferences as Record<string, unknown>),
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
        systemPreferences: {
          ...defaultSystemPreferences,
          ...(settings.system_preferences as Record<string, unknown>),
        },
      };
      await saveBusinessSettings(payload);
      setMessage("System preferences saved successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
      window.setTimeout(() => setMessage(null), 3000);
    }
  };

  const systemPreferences = settings.system_preferences as Record<string, unknown>;

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#0f3f78]">System Preferences</p>
              <h1 className="text-3xl font-black text-slate-900">Configure core system defaults</h1>
              <p className="mt-2 text-sm text-slate-500">Control language, timezone, registration, and maintenance mode options.</p>
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
              <span className="font-semibold">Default language</span>
              <input
                value={String(systemPreferences.defaultLanguage ?? "en")}
                onChange={(e) => updateField("defaultLanguage", e.target.value)}
                className="input-field w-full"
              />
            </label>

            <label className="grid gap-2 text-sm text-slate-700">
              <span className="font-semibold">Timezone</span>
              <input
                value={String(systemPreferences.timezone ?? "UTC")}
                onChange={(e) => updateField("timezone", e.target.value)}
                className="input-field w-full"
              />
            </label>

            <label className="grid gap-2 text-sm text-slate-700">
              <span className="font-semibold">Enable maintenance mode</span>
              <select
                value={String(systemPreferences.enableMaintenanceMode ?? false)}
                onChange={(e) => updateField("enableMaintenanceMode", e.target.value === "true")}
                className="input-field w-full"
              >
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
              </select>
            </label>

            <label className="grid gap-2 text-sm text-slate-700">
              <span className="font-semibold">Allow new registrations</span>
              <select
                value={String(systemPreferences.allowNewRegistrations ?? true)}
                onChange={(e) => updateField("allowNewRegistrations", e.target.value === "true")}
                className="input-field w-full"
              >
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>
          </div>

          <div className="mt-6 flex gap-3 flex-wrap">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-[#0f3f78] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0a2d56] disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save system preferences"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
