"use client";

import { useEffect, useMemo, useState } from "react";
import { authFetch } from "@/lib/auth";
import PageHeader from "@/app/components/ui/PageHeader";
import Card from "@/app/components/ui/Card";
import Button from "@/app/components/ui/Button";
import Badge from "@/app/components/ui/Badge";
import DataTable, { type DataTableColumn } from "@/app/components/ui/DataTable";

const COMMISSION_TYPES = [
  { value: "fixed", label: "Fixed amount" },
  { value: "percentage", label: "Percentage" },
] as const;

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
] as const;

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

  const columns: DataTableColumn<Record<string, unknown>>[] = [
    { key: "route", label: "Route", render: (rule) => <span className="font-semibold text-gray-800">{String(rule.route_name || "—")}</span> },
    {
      key: "fare",
      label: "Fare",
      render: (rule) => {
        const routeName = String(rule.route_name || "—");
        const fare = routeNames.includes(routeName) ? routeNames.find((route) => route === routeName) : routeName;
        return fare || "—";
      },
    },
    { key: "type", label: "Type", render: (rule) => (String(rule.commission_type || "fixed") === "percentage" ? "Percentage" : "Fixed") },
    {
      key: "value",
      label: "Value",
      render: (rule) => {
        const commissionType = String(rule.commission_type || "fixed");
        const commissionAmount = Number(rule.commission_amount ?? 0);
        return commissionType === "percentage" ? `${commissionAmount}%` : formatMwk(commissionAmount);
      },
    },
    {
      key: "status",
      label: "Status",
      render: (rule) => {
        const status = String(rule.status || "inactive");
        return <Badge tone={status === "active" ? "success" : "neutral"}>{status === "active" ? "Active" : "Inactive"}</Badge>;
      },
    },
    { key: "updated", label: "Last updated", render: (rule) => formatDate(String(rule.updated_at || rule.created_at || "")) },
    {
      key: "actions",
      label: "Actions",
      render: (rule) => (
        <Button
          variant="secondary"
          className="!px-3 !py-1 text-xs"
          onClick={() => {
            setNewRule({
              route_name: String(rule.route_name || ""),
              commission_amount: Number(rule.commission_amount ?? 0),
              commission_type: String(rule.commission_type || "fixed"),
              status: String(rule.status || "active"),
              currency: String(rule.currency || "MWK"),
            });
            setAddingRule(true);
          }}
        >
          Edit
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Commission rates"
        title="Manage route commission rules"
        description="Assign fixed or percentage commission amounts for each route, and keep the active rules up to date."
        actions={<Button onClick={() => setAddingRule(true)}>Add commission rule</Button>}
      />

      {message && (
        <div className="rounded-2xl border border-success/20 bg-success/10 p-4 text-sm text-success">{message}</div>
      )}
      {error && (
        <div className="rounded-2xl border border-danger/20 bg-danger/10 p-4 text-sm text-danger">{error}</div>
      )}

      <div className="flex flex-wrap gap-2">
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">Existing routes: {routeNames.length}</span>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">Rules: {commissionRules.length}</span>
      </div>

      <DataTable
        columns={columns}
        rows={commissionRules}
        getRowKey={(rule) => String(rule.id)}
        loading={loading}
        loadingLabel="Loading commission rules…"
        emptyTitle="No commission rules yet"
        emptyDescription="Add a commission rule to start attributing referral commissions to a route."
      />

      {addingRule && (
        <Card>
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-800">{newRule.route_name ? "Edit commission rule" : "New commission rule"}</h2>
              <p className="text-sm text-gray-500">Save route-level commission settings to preserve historical calculations.</p>
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                setAddingRule(false);
                setNewRule({ route_name: "", commission_amount: 0, commission_type: "fixed", status: "active", currency: "MWK" });
                setError("");
                setMessage("");
              }}
            >
              Cancel
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm text-gray-700">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Route</span>
              <input
                value={newRule.route_name}
                onChange={(e) => setNewRule((prev) => ({ ...prev, route_name: e.target.value }))}
                placeholder="Route name"
                className="input-field w-full"
              />
            </label>

            <label className="block text-sm text-gray-700">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Commission type</span>
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

            <label className="block text-sm text-gray-700">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Commission value</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={String(newRule.commission_amount)}
                onChange={(e) => setNewRule((prev) => ({ ...prev, commission_amount: Number(e.target.value) }))}
                className="input-field w-full"
              />
            </label>

            <label className="block text-sm text-gray-700">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Status</span>
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

            <label className="block text-sm text-gray-700 md:col-span-2">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Currency</span>
              <input
                value={newRule.currency}
                onChange={(e) => setNewRule((prev) => ({ ...prev, currency: e.target.value }))}
                className="input-field w-full"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <Button onClick={() => void saveRule(newRule)} disabled={savingRuleId !== null}>
              {savingRuleId ? "Saving…" : "Save rule"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setAddingRule(false);
                setNewRule({ route_name: "", commission_amount: 0, commission_type: "fixed", status: "active", currency: "MWK" });
                setError("");
              }}
            >
              Reset
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
