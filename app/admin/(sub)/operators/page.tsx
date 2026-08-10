"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/auth";
import Badge from "@/app/components/ui/Badge";
import { operatorApplicationStatusTone, operatorDocumentStatusTone } from "@/lib/statusTones";

type Operator = {
  id: string;
  legal_name: string;
  display_name: string;
  is_individual: boolean;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  application_status: string;
  status: string;
  created_at: string;
};

type OperatorDocument = {
  id: string;
  operatorId: string;
  subjectType: string;
  documentType: string;
  status: string;
  rejectionReason: string | null;
  signedUrl: string | null;
  createdAt: string;
};

type Vehicle = {
  id: string;
  service_type: string;
  registration_number: string;
  make: string | null;
  model: string | null;
  status: string;
};

type Driver = {
  id: string;
  full_name: string;
  phone: string;
  license_number: string;
  status: string;
};

const VEHICLE_ADMIN_ACTIONS: Record<string, { label: string; next: string }[]> = {
  pending: [
    { label: "Verify", next: "active" },
    { label: "Suspend", next: "suspended" },
  ],
  active: [{ label: "Suspend", next: "suspended" }],
  maintenance: [{ label: "Suspend", next: "suspended" }],
  expired_documents: [{ label: "Suspend", next: "suspended" }],
  suspended: [{ label: "Reinstate", next: "active" }],
};

const DRIVER_ADMIN_ACTIONS: Record<string, { label: string; next: string }[]> = {
  pending: [
    { label: "Verify", next: "verified" },
    { label: "Suspend", next: "suspended" },
  ],
  verified: [{ label: "Suspend", next: "suspended" }],
  inactive: [{ label: "Suspend", next: "suspended" }],
  suspended: [{ label: "Reinstate", next: "verified" }],
};

const APPLICATION_FILTERS = ["all", "submitted", "under_review", "changes_required", "approved", "rejected"];

export default function AdminOperatorsPage() {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [filter, setFilter] = useState("submitted");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<OperatorDocument[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [actionError, setActionError] = useState("");

  const loadOperators = async () => {
    setLoading(true);
    setError("");
    try {
      const query = filter === "all" ? "" : `?applicationStatus=${filter}`;
      const response = await authFetch(`/api/admin/operators${query}`);
      const result = await response.json();
      if (!result.success) {
        setError(result.error || "Unable to load operators");
        return;
      }
      setOperators(result.operators);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load operators");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadOperators();
    }, 0);
    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const loadDocumentsFor = async (operatorId: string) => {
    setDocumentsLoading(true);
    try {
      const [documentsRes, fleetRes] = await Promise.all([
        authFetch(`/api/admin/operators/documents?operatorId=${operatorId}`),
        authFetch(`/api/admin/operators/fleet?operatorId=${operatorId}`),
      ]);
      const [documentsResult, fleetResult] = await Promise.all([documentsRes.json(), fleetRes.json()]);
      if (documentsResult.success) setDocuments(documentsResult.documents);
      if (fleetResult.success) {
        setVehicles(fleetResult.vehicles);
        setDrivers(fleetResult.drivers);
      }
    } finally {
      setDocumentsLoading(false);
    }
  };

  const toggleExpand = async (operatorId: string) => {
    if (expandedId === operatorId) {
      setExpandedId(null);
      return;
    }

    setExpandedId(operatorId);
    await loadDocumentsFor(operatorId);
  };

  const updateFleetEntity = async (entityType: "vehicle" | "driver", entityId: string, status: string) => {
    setActionError("");
    const response = await authFetch("/api/admin/operators/fleet", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityType, entityId, status }),
    });
    const result = await response.json();
    if (!result.success) {
      setActionError(result.error || "Action failed");
      return;
    }
    if (expandedId) await loadDocumentsFor(expandedId);
  };

  const updateOperator = async (operatorId: string, payload: Record<string, unknown>) => {
    setActionError("");
    const response = await authFetch("/api/admin/operators", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operatorId, ...payload }),
    });
    const result = await response.json();
    if (!result.success) {
      setActionError(result.error || "Action failed");
      return;
    }
    await loadOperators();
  };

  const reviewDocument = async (documentId: string, status: "verified" | "rejected") => {
    setActionError("");
    let rejectionReason: string | undefined;
    if (status === "rejected") {
      rejectionReason = window.prompt("Reason for rejecting this document?") || undefined;
      if (!rejectionReason || rejectionReason.length < 5) {
        setActionError("A rejection reason of at least 5 characters is required");
        return;
      }
    }

    const response = await authFetch("/api/admin/operators/documents", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId, status, rejectionReason }),
    });
    const result = await response.json();
    if (!result.success) {
      setActionError(result.error || "Action failed");
      return;
    }
    if (expandedId) await loadDocumentsFor(expandedId);
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-extrabold text-gray-800">Operator applications</h1>
      <p className="mt-1 text-sm text-gray-600">Review new operator applications and their compliance documents.</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {APPLICATION_FILTERS.map((value) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold capitalize ${
              filter === value ? "bg-primary-600 text-white" : "bg-gray-100 text-gray-700"
            }`}
          >
            {value.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {actionError && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{actionError}</p>}

      <div className="mt-6 space-y-3">
        {loading && <p className="text-sm text-gray-500">Loading…</p>}
        {!loading && operators.length === 0 && <p className="text-sm text-gray-500">No operators match this filter.</p>}

        {operators.map((operator) => (
          <div key={operator.id} className="surface-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-bold text-gray-800">{operator.display_name}</p>
                <p className="text-sm text-gray-500">{operator.legal_name}</p>
                <p className="mt-1 text-sm text-gray-600">
                  {operator.contact_name} · {operator.contact_email} · {operator.contact_phone}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={operatorApplicationStatusTone(operator.application_status)}>{operator.application_status.replace(/_/g, " ")}</Badge>
                <Badge tone="neutral">{operator.status}</Badge>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={() => toggleExpand(operator.id)} className="btn-secondary">
                {expandedId === operator.id ? "Hide details" : "Review fleet & documents"}
              </button>
              {operator.application_status !== "approved" && (
                <button onClick={() => updateOperator(operator.id, { applicationStatus: "approved" })} className="btn-primary">
                  Approve
                </button>
              )}
              {operator.application_status !== "rejected" && (
                <button onClick={() => updateOperator(operator.id, { applicationStatus: "rejected" })} className="btn-secondary">
                  Reject
                </button>
              )}
              {operator.status === "active" && (
                <button
                  onClick={() => {
                    const reason = window.prompt("Reason for suspending this operator?");
                    if (reason && reason.length >= 5) updateOperator(operator.id, { status: "suspended", suspensionReason: reason });
                  }}
                  className="btn-secondary"
                >
                  Suspend
                </button>
              )}
            </div>

            {expandedId === operator.id && (
              <div className="mt-4 border-t border-gray-100 pt-4">
                {documentsLoading && <p className="text-sm text-gray-500">Loading…</p>}

                {!documentsLoading && (vehicles.length > 0 || drivers.length > 0) && (
                  <div className="mb-4 space-y-2">
                    <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500">Fleet</h3>
                    {vehicles.map((vehicle) => (
                      <div key={vehicle.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-100 px-4 py-3">
                        <p className="text-sm font-semibold text-gray-800">
                          {vehicle.registration_number} {vehicle.make && `· ${vehicle.make} ${vehicle.model ?? ""}`}
                        </p>
                        <div className="flex items-center gap-2">
                          <Badge tone="neutral">{vehicle.status}</Badge>
                          {(VEHICLE_ADMIN_ACTIONS[vehicle.status] ?? []).map((action) => (
                            <button
                              key={action.label}
                              onClick={() => updateFleetEntity("vehicle", vehicle.id, action.next)}
                              className="btn-secondary px-3 py-1 text-xs"
                            >
                              {action.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                    {drivers.map((driver) => (
                      <div key={driver.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-100 px-4 py-3">
                        <p className="text-sm font-semibold text-gray-800">
                          {driver.full_name} · {driver.license_number}
                        </p>
                        <div className="flex items-center gap-2">
                          <Badge tone="neutral">{driver.status}</Badge>
                          {(DRIVER_ADMIN_ACTIONS[driver.status] ?? []).map((action) => (
                            <button
                              key={action.label}
                              onClick={() => updateFleetEntity("driver", driver.id, action.next)}
                              className="btn-secondary px-3 py-1 text-xs"
                            >
                              {action.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500">Documents</h3>
                {!documentsLoading && documents.length === 0 && <p className="text-sm text-gray-500">No documents uploaded yet.</p>}
                <div className="mt-2 space-y-2">
                  {documents.map((doc) => (
                    <div key={doc.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-100 px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold capitalize text-gray-800">{doc.documentType.replace(/_/g, " ")}</p>
                        {doc.signedUrl && (
                          <a href={doc.signedUrl} target="_blank" rel="noreferrer" className="text-xs text-primary-600 underline">
                            View document
                          </a>
                        )}
                        {doc.rejectionReason && <p className="text-xs text-red-600">{doc.rejectionReason}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={operatorDocumentStatusTone(doc.status)}>{doc.status}</Badge>
                        {doc.status === "pending" && (
                          <>
                            <button onClick={() => reviewDocument(doc.id, "verified")} className="btn-secondary px-3 py-1 text-xs">
                              Verify
                            </button>
                            <button onClick={() => reviewDocument(doc.id, "rejected")} className="btn-secondary px-3 py-1 text-xs">
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
