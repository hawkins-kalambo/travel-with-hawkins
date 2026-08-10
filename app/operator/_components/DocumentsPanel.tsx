"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { authFetch } from "@/lib/auth";

type OperatorDocument = {
  id: string;
  subject_type: string;
  subject_id: string;
  document_type: string;
  status: string;
  rejection_reason: string | null;
  created_at: string;
};

type SubjectOption = { subjectType: string; subjectId: string; label: string };

const DOCUMENT_TYPES = [
  { value: "business_registration", label: "Business registration" },
  { value: "insurance", label: "Insurance certificate" },
  { value: "tax_clearance", label: "Tax clearance" },
  { value: "vehicle_registration", label: "Vehicle registration" },
  { value: "roadworthiness", label: "Roadworthiness certificate" },
  { value: "drivers_license", label: "Driver's license" },
  { value: "police_clearance", label: "Police clearance" },
  { value: "other", label: "Other" },
];

const STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-800",
  verified: "bg-green-50 text-green-800",
  rejected: "bg-red-50 text-red-800",
  expiring: "bg-orange-50 text-orange-800",
  expired: "bg-red-50 text-red-800",
  replaced: "bg-gray-100 text-gray-700",
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function DocumentsPanel({ operatorId }: { operatorId: string }) {
  const [documents, setDocuments] = useState<OperatorDocument[]>([]);
  const [subjectOptions, setSubjectOptions] = useState<SubjectOption[]>([{ subjectType: "operator", subjectId: operatorId, label: "Business (operator-level)" }]);
  const [selectedSubjectIndex, setSelectedSubjectIndex] = useState(0);
  const [documentType, setDocumentType] = useState(DOCUMENT_TYPES[0].value);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    const [documentsRes, vehiclesRes, driversRes] = await Promise.all([
      authFetch("/api/operators/documents"),
      authFetch("/api/operators/vehicles"),
      authFetch("/api/operators/drivers"),
    ]);
    const [documentsResult, vehiclesResult, driversResult] = await Promise.all([documentsRes.json(), vehiclesRes.json(), driversRes.json()]);

    if (documentsResult.success) setDocuments(documentsResult.documents);

    const vehicleOptions: SubjectOption[] = vehiclesResult.success
      ? vehiclesResult.vehicles.map((v: { id: string; registration_number: string }) => ({
          subjectType: "vehicle",
          subjectId: v.id,
          label: `Vehicle: ${v.registration_number}`,
        }))
      : [];
    const driverOptions: SubjectOption[] = driversResult.success
      ? driversResult.drivers.map((d: { id: string; full_name: string }) => ({ subjectType: "driver", subjectId: d.id, label: `Driver: ${d.full_name}` }))
      : [];

    setSubjectOptions([{ subjectType: "operator", subjectId: operatorId, label: "Business (operator-level)" }, ...vehicleOptions, ...driverOptions]);
    setLoaded(true);
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const documentsBySubject = useMemo(() => {
    const labelFor = (subjectType: string, subjectId: string) =>
      subjectOptions.find((option) => option.subjectType === subjectType && option.subjectId === subjectId)?.label ?? subjectType;
    return documents.map((doc) => ({ ...doc, subjectLabel: labelFor(doc.subject_type, doc.subject_id) }));
  }, [documents, subjectOptions]);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const subject = subjectOptions[selectedSubjectIndex];
    if (!subject) return;

    setError("");
    setUploading(true);

    try {
      const base64 = await readFileAsDataUrl(file);
      const response = await authFetch("/api/operators/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectType: subject.subjectType,
          subjectId: subject.subjectId,
          documentType,
          file: base64,
        }),
      });
      const result = await response.json();

      if (!result.success) {
        setError(result.error || "Upload failed");
        return;
      }

      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="surface-card mt-6 p-6">
      <h2 className="text-lg font-bold text-gray-800">Documents</h2>
      <p className="mt-1 text-sm text-gray-600">Upload paperwork for your business, a vehicle, or a driver.</p>

      {error && <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <select className="input-field w-auto" value={selectedSubjectIndex} onChange={(e) => setSelectedSubjectIndex(Number(e.target.value))}>
          {subjectOptions.map((option, index) => (
            <option key={`${option.subjectType}-${option.subjectId}`} value={index}>
              {option.label}
            </option>
          ))}
        </select>
        <select className="input-field w-auto" value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
          {DOCUMENT_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
        <label className="btn-secondary cursor-pointer">
          {uploading ? "Uploading…" : "Choose file"}
          <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="hidden" onChange={handleFileChange} disabled={uploading} />
        </label>
      </div>

      <div className="mt-6 space-y-2">
        {!loaded && <p className="text-sm text-gray-500">Loading documents…</p>}
        {loaded && documentsBySubject.length === 0 && <p className="text-sm text-gray-500">No documents uploaded yet.</p>}
        {documentsBySubject.map((doc) => (
          <div key={doc.id} className="flex items-center justify-between rounded-xl border border-gray-100 px-4 py-3">
            <div>
              <p className="text-sm font-semibold capitalize text-gray-800">{doc.document_type.replace(/_/g, " ")}</p>
              <p className="text-xs text-gray-500">{doc.subjectLabel}</p>
              {doc.status === "rejected" && doc.rejection_reason && <p className="mt-0.5 text-xs text-red-600">{doc.rejection_reason}</p>}
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${STATUS_TONE[doc.status] ?? "bg-gray-100 text-gray-700"}`}>
              {doc.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
