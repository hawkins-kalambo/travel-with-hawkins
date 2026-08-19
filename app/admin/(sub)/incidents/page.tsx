"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/auth";
import PageHeader from "@/app/components/ui/PageHeader";
import Card from "@/app/components/ui/Card";
import Button from "@/app/components/ui/Button";
import Badge from "@/app/components/ui/Badge";

type Incident = {
  id: string;
  case_number: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "acknowledged" | "investigating" | "resolved" | "closed";
  title: string;
  description: string | null;
  scope_type: string;
  scope_service_type: string | null;
  operator_id: string | null;
  resolution: string | null;
  root_cause: string | null;
  corrective_action: string | null;
  customer_communication_sent: boolean;
  created_at: string;
};

type Operator = { id: string; display_name: string };

const SEVERITY_VALUES = ["low", "medium", "high", "critical"] as const;
const SCOPE_TYPES = ["marketplace", "service_type", "operator", "route", "departure", "listing", "booking", "other"] as const;
const SERVICE_TYPES = ["intercity", "taxi", "car_hire"] as const;

const SEVERITY_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  low: "success",
  medium: "warning",
  high: "danger",
  critical: "danger",
};

const STATUS_ACTIONS: Record<string, { label: string; next: string }[]> = {
  open: [{ label: "Acknowledge", next: "acknowledged" }],
  acknowledged: [{ label: "Start investigating", next: "investigating" }],
  investigating: [{ label: "Mark resolved", next: "resolved" }],
  resolved: [{ label: "Close", next: "closed" }],
  closed: [],
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    severity: "medium" as (typeof SEVERITY_VALUES)[number],
    title: "",
    description: "",
    scopeType: "operator" as (typeof SCOPE_TYPES)[number],
    scopeServiceType: "",
    operatorId: "",
  });

  const loadIncidents = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await authFetch("/api/admin/incidents");
      const result = await response.json();
      if (!result.success) {
        setError(result.error || "Unable to load incidents");
        return;
      }
      setIncidents(result.incidents);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load incidents");
    } finally {
      setLoading(false);
    }
  };

  const loadOperators = async () => {
    try {
      const response = await authFetch("/api/admin/operators?applicationStatus=all");
      const result = await response.json();
      if (result.success) setOperators(result.operators.map((op: { id: string; display_name: string }) => ({ id: op.id, display_name: op.display_name })));
    } catch {
      // Operator dropdown is a convenience only — an empty list still lets
      // non-operator-scoped incidents get filed.
    }
  };

  useEffect(() => {
    void loadIncidents();
    void loadOperators();
  }, []);

  const createIncident = async () => {
    if (form.title.trim().length < 5) {
      setError("A title of at least 5 characters is required");
      return;
    }
    if (form.scopeType === "operator" && !form.operatorId) {
      setError("Select an operator for an operator-scoped incident");
      return;
    }

    setError("");
    setSaving(true);
    try {
      const response = await authFetch("/api/admin/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          severity: form.severity,
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          scopeType: form.scopeType,
          scopeServiceType: form.scopeServiceType || undefined,
          operatorId: form.scopeType === "operator" ? form.operatorId : undefined,
        }),
      });
      const result = await response.json();
      if (!result.success) {
        setError(result.error || "Unable to create incident");
        return;
      }
      setCreating(false);
      setForm({ severity: "medium", title: "", description: "", scopeType: "operator", scopeServiceType: "", operatorId: "" });
      await loadIncidents();
    } finally {
      setSaving(false);
    }
  };

  const advanceStatus = async (incident: Incident, nextStatus: string) => {
    let resolution: string | undefined;
    if (nextStatus === "resolved") {
      resolution = window.prompt("Resolution summary for this incident?") || undefined;
      if (!resolution || resolution.length < 5) {
        setError("A resolution of at least 5 characters is required to resolve an incident");
        return;
      }
    }

    setError("");
    const response = await authFetch("/api/admin/incidents", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ incidentId: incident.id, status: nextStatus, resolution }),
    });
    const result = await response.json();
    if (!result.success) {
      setError(result.error || "Unable to update incident");
      return;
    }
    await loadIncidents();
  };

  const operatorName = (operatorId: string | null) => operators.find((op) => op.id === operatorId)?.display_name ?? operatorId ?? "—";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Launch safety"
        title="Incidents"
        description="Structured incident tracking for marketplace-wide, service-type, operator, and route-level issues. Every status change is written to the audit trail."
        actions={<Button onClick={() => setCreating((value) => !value)}>{creating ? "Cancel" : "File incident"}</Button>}
      />

      {error && <div className="rounded-2xl border border-danger/20 bg-danger/10 p-4 text-sm text-danger">{error}</div>}

      {creating && (
        <Card>
          <h2 className="text-lg font-semibold text-gray-800">File a new incident</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="block text-sm text-gray-700">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Severity</span>
              <select
                value={form.severity}
                onChange={(e) => setForm((prev) => ({ ...prev, severity: e.target.value as (typeof SEVERITY_VALUES)[number] }))}
                className="input-field w-full"
              >
                {SEVERITY_VALUES.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>

            <label className="block text-sm text-gray-700">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Scope</span>
              <select
                value={form.scopeType}
                onChange={(e) => setForm((prev) => ({ ...prev, scopeType: e.target.value as (typeof SCOPE_TYPES)[number] }))}
                className="input-field w-full"
              >
                {SCOPE_TYPES.map((value) => (
                  <option key={value} value={value}>{value.replace(/_/g, " ")}</option>
                ))}
              </select>
            </label>

            {form.scopeType === "operator" && (
              <label className="block text-sm text-gray-700">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Operator</span>
                <select
                  value={form.operatorId}
                  onChange={(e) => setForm((prev) => ({ ...prev, operatorId: e.target.value }))}
                  className="input-field w-full"
                >
                  <option value="">Select operator…</option>
                  {operators.map((op) => (
                    <option key={op.id} value={op.id}>{op.display_name}</option>
                  ))}
                </select>
              </label>
            )}

            {form.scopeType === "service_type" && (
              <label className="block text-sm text-gray-700">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Service type</span>
                <select
                  value={form.scopeServiceType}
                  onChange={(e) => setForm((prev) => ({ ...prev, scopeServiceType: e.target.value }))}
                  className="input-field w-full"
                >
                  <option value="">Select…</option>
                  {SERVICE_TYPES.map((value) => (
                    <option key={value} value={value}>{value.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </label>
            )}

            <label className="block text-sm text-gray-700 md:col-span-2">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Title</span>
              <input
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Short summary of the incident"
                className="input-field w-full"
              />
            </label>

            <label className="block text-sm text-gray-700 md:col-span-2">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Description</span>
              <textarea
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                rows={3}
                className="input-field w-full"
              />
            </label>
          </div>

          <div className="mt-4">
            <Button onClick={() => void createIncident()} disabled={saving}>
              {saving ? "Filing…" : "File incident"}
            </Button>
          </div>
        </Card>
      )}

      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {!loading && incidents.length === 0 && <p className="text-sm text-gray-500">No incidents filed.</p>}

      <div className="space-y-3">
        {incidents.map((incident) => (
          <Card key={incident.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{incident.case_number}</p>
                <p className="font-bold text-gray-800">{incident.title}</p>
                <p className="mt-1 text-sm text-gray-600">
                  {incident.scope_type.replace(/_/g, " ")}
                  {incident.scope_service_type ? ` · ${incident.scope_service_type.replace(/_/g, " ")}` : ""}
                  {incident.operator_id ? ` · ${operatorName(incident.operator_id)}` : ""}
                </p>
                {incident.description && <p className="mt-1 text-sm text-gray-500">{incident.description}</p>}
                {incident.resolution && <p className="mt-1 text-sm text-gray-500"><b>Resolution:</b> {incident.resolution}</p>}
                <p className="mt-1 text-xs text-gray-400">Filed {formatDate(incident.created_at)}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={SEVERITY_TONE[incident.severity] ?? "neutral"}>{incident.severity}</Badge>
                <Badge tone="neutral">{incident.status}</Badge>
              </div>
            </div>

            {(STATUS_ACTIONS[incident.status] ?? []).length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {STATUS_ACTIONS[incident.status].map((action) => (
                  <button key={action.label} onClick={() => void advanceStatus(incident, action.next)} className="btn-secondary px-3 py-1 text-xs">
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
