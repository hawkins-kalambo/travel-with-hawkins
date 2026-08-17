"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { authFetch } from "@/lib/auth";
import { parseRoutePrices } from "@/lib/routePricing";
import PageHeader from "@/app/components/ui/PageHeader";
import { LoadingState } from "@/app/components/ui/Spinner";

type FairRatesEditorProps = {
  routesStr: string;
  onChange: (next: string) => void;
};

function FairRatesEditor({ routesStr, onChange }: FairRatesEditorProps) {
  const priceMap = useMemo(() => parseRoutePrices(routesStr), [routesStr]);
  const destinations = useMemo(() => Object.keys(priceMap).sort((a, b) => a.localeCompare(b)), [priceMap]);

  const [selected, setSelected] = useState<string>(destinations[0] || "");
  const [fairValue, setFairValue] = useState<string>("0");

  const save = () => {
    const nextFair = parseInt(fairValue, 10);
    if (!selected || isNaN(nextFair) || nextFair < 0) return;

    const updated = new Map<string, number>(Object.entries(priceMap));
    updated.set(selected, nextFair);

    const lines = Array.from(updated.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([dest, fair]) => `${dest}: ${fair}`);

    onChange(lines.join("\n"));
  };

  const addNew = () => {
    const newDest = prompt(
      "Enter destination/route exactly as it appears in booking destination (e.g. 'Mzuzu → Lilongwe'):"
    );
    if (!newDest) return;
    const trimmed = newDest.trim();
    if (!trimmed) return;

    const nextFair = parseInt(fairValue, 10);
    const v = isNaN(nextFair) ? 0 : nextFair;

    const updated = new Map<string, number>(Object.entries(priceMap));
    updated.set(trimmed, v);

    const lines = Array.from(updated.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([dest, fair]) => `${dest}: ${fair}`);

    setSelected(trimmed);
    onChange(lines.join("\n"));
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Route/Destination</label>
          <select value={selected} onChange={(e) => setSelected(e.target.value)} className="input-field">
            {destinations.length === 0 ? (
              <option value="">No routes found</option>
            ) : (
              destinations.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))
            )}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Fair (per seat) (MWK)</label>
          <input
            type="number"
            inputMode="numeric"
            value={fairValue}
            onChange={(e) => setFairValue(e.target.value)}
            className="input-field"
          />
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button onClick={save} disabled={!selected} className="btn-primary disabled:opacity-50">
          ✓ Set Fair
        </button>
        <button onClick={addNew} className="btn-secondary">
          ＋ Add route
        </button>
      </div>

      <p className="text-[12px] text-slate-500">
        The editor updates the same underlying <span className="font-mono">routes</span> config. Default format supported:
        <span className="block font-mono mt-1">Destination: Fair</span>
      </p>
    </div>
  );
}

const defaultSettings = {
  bookingFee: "2000",
  maxSeats: "15",
  routes:
    "Mzuzu - Lilongwe: 5000\nMzuzu - Blantyre: 8000\nMzuzu - Zomba: 7000\nMzuzu - Kasungu: 3000\nMzuzu - Karonga: 6000",
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
          routes: String(payload.routes ?? defaultSettings.routes),
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
        body: JSON.stringify({ bookingFee: settings.bookingFee, maxSeats: settings.maxSeats, routes: settings.routes }),
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
        description="Adjust ticket parameters, routes, and vehicle settings for the current dashboard session."
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

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Fair rates per route (per seat) (MWK)</label>
                <FairRatesEditor routesStr={settings.routes} onChange={(next) => setSettings({ ...settings, routes: next })} />
              </div>

              <button
                onClick={saveSettings}
                className="rounded-lg bg-primary-900 px-5 py-2.5 font-semibold text-white shadow-sm transition hover:bg-primary-800"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
