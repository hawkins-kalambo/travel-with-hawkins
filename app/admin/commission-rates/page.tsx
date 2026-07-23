"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/auth";

const COMMISSION_TYPES = [
  { value: "fixed", label: "Fixed amount" },
  { value: "percentage", label: "Percentage" },
] as const;

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
] as const;

async function authFetch(input: RequestInfo | URL, init?: RequestInit) {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    const headers = new Headers(init?.headers as HeadersInit | undefined);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(input, { ...init, headers, credentials: "same-origin" });
  } catch {
    return fetch(input, { ...init, credentials: "same-origin" });
  }
}

function formatMwk(value: number | string | undefined) {
  const numericValue = typeof value === "number" ? value : Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(numericValue)) return "MWK 0";
  return `MWK ${numericValue.toLocaleString("en-MW")}`;
}

function formatDate(value: string | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "2-digit" });
}

export default function CommissionRatesPage() {
  const [commissionRules, setCommissionRules] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [savingRuleId, setSavingRuleId] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [draftRoutes, setDraftRoutes] = useState<string[]>([]);
  const [addingRule, setAddingRule] = useState(false);
  const [newRule, setNewRule] = useState({ route_name: "", commission_amount: 0, commission_type: "fixed", status: "active", currency: "MWK" });

  const routeNames = useMemo(() => {
    return draftRoutes
      .map((route) => route.trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }, [draftRoutes]);

  function parseRouteNames(settingsData: unknown): string[] {
    const settings = settingsData as { settings?: Record<string, unknown> } | undefined;
    const objects = settings?.settings?.route_objects;
    if (Array.isArray(objects)) {
      return objects
        .map((item) => {
          if (!item || typeof item !== "object") return "";
          return String((item as Record<string, unknown>).route_name ?? "").trim();
        })
        .filter(Boolean);
    }

    const routesText = typeof settings?.settings?.routes === "string" ? settings.settings.routes : "";
    return routesText.split("\n").map((line: string) => line.split(":")[0]?.trim() ?? "").filter(Boolean);
  }

  useEffect(() => {
    const loadRules = async () => {
      setLoading(true);
      setError("");
      try {
        const [settingsRes, rulesRes] = await Promise.all([
          fetch("/api/settings", { credentials: "same-origin" }),
          authFetch("/api/commission-rules", { method: "GET" }),
        ]);

        const settingsData = await settingsRes.json();
        setDraftRoutes(parseRouteNames(settingsData));

        if (!rulesRes.ok) {
          const result = await rulesRes.json();
          throw new Error(result?.error || "Failed to load commission rules");
        }

        const result = await rulesRes.json();
        setCommissionRules(Array.isArray(result?.commissionRules) ? result.commissionRules : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };

    void loadRules();
  }, []);

  const saveRule = async (rule: Record<string, unknown>) => {
    const id = String(rule.id || "");
    const routeName = String(rule.route_name || "").trim();
    const commissionAmount = Number(rule.commission_amount ?? 0);
    const commissionType = String(rule.commission_type || "fixed");
    const status = String(rule.status || "active");
    const currency = String(rule.currency || "MWK");

    if (!routeName) {
      setError("Route is required.");
      return;
    }

    if (!Number.isFinite(commissionAmount) || commissionAmount < 0) {
      setError("Commission value must be a non-negative number.");
      return;
    }

    if (!["fixed", "percentage"].includes(commissionType)) {
      setError("Commission type must be fixed or percentage.");
      return;
    }

    if (!["active", "inactive"].includes(status)) {
      setError("Status must be active or inactive.");
      return;
    }

    setError("");
    setMessage("");
    setSavingRuleId(id || "new");

    try {
      const res = await authFetch(id ? "/api/commission-rules" : "/api/commission-rules", {
        method: id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: id || undefined,
          routeName,
          commissionAmount,
          commissionType,
          status,
          currency,
        }),
      });

      const result = await res.json();
      if (!res.ok || !result?.success) {
        throw new Error(result?.error || "Unable to save commission rule");
      }

      const updatedRule = result.commissionRule;
      setCommissionRules((current) => {
        const existingIndex = current.findIndex((item) => String(item.id) === String(updatedRule.id));
        if (existingIndex >= 0) {
          const next = [...current];
          next[existingIndex] = updatedRule;
          return next;
        }
        return [...current, updatedRule];
      });
      setMessage("Commission rule saved successfully.");
      setAddingRule(false);
      setNewRule({ route_name: "", commission_amount: 0, commission_type: "fixed", status: "active", currency: "MWK" });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingRuleId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#0f3f78]">Commission Rates</p>
              <h1 className="text-3xl font-black text-slate-900">Manage route commission rules</h1>
              <p className="mt-2 text-sm text-slate-500">Assign fixed or percentage commission amounts for each route, and keep the active rules up to date.</p>
            </div>
            <button
              onClick={() => setAddingRule(true)}
              className="rounded-lg bg-[#0f3f78] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0a2d56]"
            >
              Add commission rule
            </button>
          </div>
        </div>

        {message && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{message}</div>
        )}
        {error && (
          <div className="rounded-2xl border border-danger/20 bg-danger/10 p-4 text-sm text-danger">{error}</div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Existing routes: {routeNames.length}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Rules: {commissionRules.length}</span>
          </div>

          {loading ? (
            <p className="text-sm text-slate-500">Loading commission rules…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-3">Route</th>
                    <th className="px-3 py-3">Fare</th>
                    <th className="px-3 py-3">Type</th>
                    <th className="px-3 py-3">Value</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Last Updated</th>
                    <th className="px-3 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {commissionRules.map((rule) => {
                    const id = String(rule.id || "");
                    const routeName = String(rule.route_name || "—");
                    const commissionType = String(rule.commission_type || "fixed");
                    const commissionAmount = Number(rule.commission_amount ?? 0);
                    const status = String(rule.status || "inactive");
                    const updatedAt = String(rule.updated_at || rule.created_at || "");
                    const fare = routeNames.includes(routeName) ? routeNames.find((route) => route === routeName) : routeName;
                    return (
                      <tr key={id} className="border-b border-slate-100 last:border-b-0">
                        <td className="px-3 py-3 font-medium text-slate-900">{routeName}</td>
                        <td className="px-3 py-3 text-slate-600">{fare || "—"}</td>
                        <td className="px-3 py-3 text-slate-600">{commissionType === "percentage" ? "Percentage" : "Fixed"}</td>
                        <td className="px-3 py-3 text-slate-900">{commissionType === "percentage" ? `${commissionAmount}%` : formatMwk(commissionAmount)}</td>
                        <td className="px-3 py-3 text-slate-600">{status === "active" ? "Active" : "Inactive"}</td>
                        <td className="px-3 py-3 text-slate-600">{formatDate(updatedAt)}</td>
                        <td className="px-3 py-3">
                          <button
                            onClick={() => {
                              setNewRule({
                                route_name: routeName,
                                commission_amount: commissionAmount,
                                commission_type: commissionType,
                                status,
                                currency: String(rule.currency || "MWK"),
                              });
                              setAddingRule(true);
                            }}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {addingRule && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">{newRule.route_name ? "Edit Commission Rule" : "New Commission Rule"}</h2>
                <p className="text-sm text-slate-500">Save route-level commission settings to preserve historical calculations.</p>
              </div>
              <button
                onClick={() => {
                  setAddingRule(false);
                  setNewRule({ route_name: "", commission_amount: 0, commission_type: "fixed", status: "active", currency: "MWK" });
                  setError("");
                  setMessage("");
                }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm text-slate-700">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Route</span>
                <input
                  value={newRule.route_name}
                  onChange={(e) => setNewRule((prev) => ({ ...prev, route_name: e.target.value }))}
                  placeholder="Route name"
                  className="input-field w-full"
                />
              </label>

              <label className="block text-sm text-slate-700">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Commission type</span>
                <select
                  value={newRule.commission_type}
                  onChange={(e) => setNewRule((prev) => ({ ...prev, commission_type: e.target.value }))}
                  className="input-field w-full"
                >
                  {COMMISSION_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </label>

              <label className="block text-sm text-slate-700">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Commission value</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={String(newRule.commission_amount)}
                  onChange={(e) => setNewRule((prev) => ({ ...prev, commission_amount: Number(e.target.value) }))}
                  className="input-field w-full"
                />
              </label>

              <label className="block text-sm text-slate-700">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Status</span>
                <select
                  value={newRule.status}
                  onChange={(e) => setNewRule((prev) => ({ ...prev, status: e.target.value }))}
                  className="input-field w-full"
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className="block text-sm text-slate-700 md:col-span-2">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Currency</span>
                <input
                  value={newRule.currency}
                  onChange={(e) => setNewRule((prev) => ({ ...prev, currency: e.target.value }))}
                  className="input-field w-full"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={() => void saveRule(newRule)}
                disabled={savingRuleId !== null}
                className="rounded-lg bg-[#0f3f78] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0a2d56] disabled:opacity-60"
              >
                {savingRuleId ? "Saving…" : "Save rule"}
              </button>
              <button
                onClick={() => {
                  setAddingRule(false);
                  setNewRule({ route_name: "", commission_amount: 0, commission_type: "fixed", status: "active", currency: "MWK" });
                  setError("");
                }}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Reset
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
