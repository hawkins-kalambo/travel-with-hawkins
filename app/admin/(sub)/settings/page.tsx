"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/auth";
import PageHeader from "@/app/components/ui/PageHeader";
import { LoadingState } from "@/app/components/ui/Spinner";

const defaultSettings = {
  bookingFee: "2000",
  maxSeats: "15",
};

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const loadSettings = useCallback(async () => {
    try {
      const res = await authFetch("/api/settings", { method: "GET" });
      if (res.status === 401) return;
      const data: unknown = await res.json();
      const payload = (data as { settings?: Record<string, unknown> } | null | undefined)?.settings;
      if (payload) {
        setSettings({
          bookingFee: String(payload.booking_fee ?? payload.bookingFee ?? defaultSettings.bookingFee),
          maxSeats: String(payload.max_seats ?? payload.maxSeats ?? defaultSettings.maxSeats),
        });
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadSettings();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadSettings]);

  const saveSettings = async () => {
    try {
      const res = await authFetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingFee: settings.bookingFee, maxSeats: settings.maxSeats }),
      });

      const data: unknown = await res.json();
      const success = (data as { success?: unknown })?.success === true;

      if (!success) {
        setStatus("error");
        setMessage("❌ Failed to update settings.");
        return;
      }

      setStatus("success");
      setMessage("✅ Settings updated successfully.");
      await loadSettings();
    } catch (error) {
      console.error("Failed to save settings:", error);
      setStatus("error");
      setMessage("❌ Failed to update settings.");
    } finally {
      setTimeout(() => {
        setStatus("idle");
        setMessage("");
      }, 3000);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="System Configuration"
        description="Adjust ticket parameters for the current dashboard session."
      />

      {loading ? (
        <LoadingState label="Loading settings…" />
      ) : (
        <div className="max-w-2xl space-y-6">
          <div className="bg-white border border-[#d7ebff] rounded-xl shadow-sm p-6">
            {message && (
              <div
                className={`mb-4 rounded-lg border p-3 text-sm ${status === "success" ? "border-primary-200 bg-primary-100 text-primary-700" : status === "error" ? "border-danger/20 bg-danger/10 text-danger" : "border-warning/20 bg-warning/10 text-warning"}`}
              >
                {message}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Booking Fee (flat, paid when Confirmed/✓ Pay) (MWK)</label>
                <input
                  type="number"
                  value={settings.bookingFee}
                  onChange={(e) => setSettings({ ...settings, bookingFee: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent-600"
                />
                <p className="text-[12px] text-slate-500 mt-2">
                  Added once per booking (regardless of destination). This updates the Overview cashflow.
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Max Seats per Vehicle</label>
                <input
                  type="number"
                  value={settings.maxSeats}
                  onChange={(e) => setSettings({ ...settings, maxSeats: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent-600"
                />
              </div>

              <button
                onClick={saveSettings}
                className="rounded-lg bg-primary-900 px-5 py-2.5 font-semibold text-white shadow-sm transition hover:bg-primary-800"
              >
                Save Settings
              </button>
            </div>
          </div>

          <div className="bg-white border border-[#d7ebff] rounded-xl shadow-sm p-6">
            <h3 className="text-sm font-semibold text-slate-700">Route fares</h3>
            <p className="mt-2 text-sm text-slate-600">
              Route and fare management has moved to Business Configuration, where every route is a real, structured
              record instead of free text.
            </p>
            <Link
              href="/admin/business-configuration/routes-and-fares"
              className="mt-3 inline-flex rounded-lg bg-primary-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-800"
            >
              Go to Routes and Fares
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
