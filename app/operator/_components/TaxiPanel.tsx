"use client";

import { FormEvent, useEffect, useState } from "react";
import { authFetch } from "@/lib/auth";
import { formatMwk } from "@/lib/routePricing";

type ServiceApproval = {
  id: string;
  service_type: string;
  status: string;
  notes: string | null;
};

type TaxiFare = {
  id: string;
  origin_label: string;
  destination_label: string;
  fare: number;
  status: string;
};

const APPROVAL_STATUS_COPY: Record<string, { label: string; tone: string; message: string }> = {
  pending: { label: "Pending review", tone: "bg-amber-50 text-amber-800", message: "We're reviewing your request to offer taxi service." },
  approved: { label: "Approved", tone: "bg-green-50 text-green-800", message: "Add the trip legs you offer and their fares below." },
  rejected: { label: "Not approved", tone: "bg-red-50 text-red-800", message: "Your request to offer taxi service wasn't approved." },
  suspended: { label: "Suspended", tone: "bg-red-50 text-red-800", message: "Your taxi service is currently suspended." },
};

export default function TaxiPanel() {
  const [approval, setApproval] = useState<ServiceApproval | null>(null);
  const [fares, setFares] = useState<TaxiFare[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [fareForm, setFareForm] = useState({ originLabel: "", destinationLabel: "", fare: "" });

  const load = async () => {
    const approvalsRes = await authFetch("/api/operators/service-approvals");
    const approvalsResult = await approvalsRes.json();
    const taxiApproval: ServiceApproval | undefined = approvalsResult.success
      ? approvalsResult.serviceApprovals.find((a: ServiceApproval) => a.service_type === "taxi")
      : undefined;
    setApproval(taxiApproval ?? null);

    if (taxiApproval?.status === "approved") {
      const faresRes = await authFetch("/api/operators/taxi-fares");
      const faresResult = await faresRes.json();
      if (faresResult.success) setFares(faresResult.taxiFares);
    }
    setLoaded(true);
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  const requestTaxiService = async () => {
    setError("");
    const response = await authFetch("/api/operators/service-approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceType: "taxi" }),
    });
    const result = await response.json();
    if (!result.success) {
      setError(result.error || "Failed to request taxi service");
      return;
    }
    await load();
  };

  const addFare = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const response = await authFetch("/api/operators/taxi-fares", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        originLabel: fareForm.originLabel,
        destinationLabel: fareForm.destinationLabel,
        fare: Number(fareForm.fare),
      }),
    });
    const result = await response.json();
    if (!result.success) {
      setError(result.error || "Failed to add fare");
      return;
    }
    setFareForm({ originLabel: "", destinationLabel: "", fare: "" });
    await load();
  };

  const toggleFareStatus = async (fare: TaxiFare) => {
    setError("");
    const response = await authFetch(`/api/operators/taxi-fares/${fare.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: fare.status === "active" ? "inactive" : "active" }),
    });
    const result = await response.json();
    if (!result.success) {
      setError(result.error || "Action failed");
      return;
    }
    await load();
  };

  const removeFare = async (fareId: string) => {
    setError("");
    const response = await authFetch(`/api/operators/taxi-fares/${fareId}`, { method: "DELETE" });
    const result = await response.json();
    if (!result.success) {
      setError(result.error || "Action failed");
      return;
    }
    await load();
  };

  if (!loaded) return null;

  return (
    <div className="mt-6 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <h2 className="text-lg font-bold text-slate-900">Taxi</h2>

      {error && <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {!approval && (
        <div className="mt-3">
          <p className="text-sm text-slate-600">You haven&apos;t applied to offer taxi service yet.</p>
          <button onClick={requestTaxiService} className="btn-primary mt-3">
            Request taxi service
          </button>
        </div>
      )}

      {approval && approval.status !== "approved" && (
        <div className="mt-3">
          <span className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${APPROVAL_STATUS_COPY[approval.status]?.tone ?? "bg-gray-100 text-gray-700"}`}>
            {APPROVAL_STATUS_COPY[approval.status]?.label ?? approval.status}
          </span>
          <p className="mt-2 text-sm text-slate-600">{APPROVAL_STATUS_COPY[approval.status]?.message}</p>
          {approval.notes && <p className="mt-1 text-sm text-slate-500">{approval.notes}</p>}
        </div>
      )}

      {approval && approval.status === "approved" && (
        <div className="mt-3">
          <p className="text-sm text-slate-600">Set the fare for each trip you offer. Customers will see these as available taxi legs.</p>

          <form onSubmit={addFare} className="mt-3 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-end">
            <input
              className="input-field w-full sm:w-auto"
              placeholder="From (e.g. Mzuzu CBD)"
              required
              value={fareForm.originLabel}
              onChange={(e) => setFareForm({ ...fareForm, originLabel: e.target.value })}
            />
            <input
              className="input-field w-full sm:w-auto"
              placeholder="To (e.g. Mzuzu Airport)"
              required
              value={fareForm.destinationLabel}
              onChange={(e) => setFareForm({ ...fareForm, destinationLabel: e.target.value })}
            />
            <input
              className="input-field w-full sm:w-32"
              placeholder="Fare (MWK)"
              type="number"
              min={1}
              required
              value={fareForm.fare}
              onChange={(e) => setFareForm({ ...fareForm, fare: e.target.value })}
            />
            <button type="submit" className="btn-primary w-full sm:w-auto">
              Add fare
            </button>
          </form>

          <div className="mt-4 space-y-2">
            {fares.length === 0 && <p className="text-sm text-slate-500">No fares configured yet.</p>}
            {fares.map((fare) => (
              <div key={fare.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-100 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {fare.origin_label} → {fare.destination_label}
                  </p>
                  <p className="text-xs text-slate-500">{formatMwk(fare.fare)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${fare.status === "active" ? "bg-green-50 text-green-800" : "bg-gray-100 text-gray-700"}`}>
                    {fare.status}
                  </span>
                  <button onClick={() => toggleFareStatus(fare)} className="btn-secondary px-3 py-1 text-xs">
                    {fare.status === "active" ? "Deactivate" : "Activate"}
                  </button>
                  <button onClick={() => removeFare(fare.id)} className="btn-secondary px-3 py-1 text-xs">
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
