"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { authFetch } from "@/lib/auth";

type OperatorDocument = {
  id: string;
  document_type: string;
  status: string;
  rejection_reason: string | null;
  created_at: string;
};

const DOCUMENT_TYPES = [
  { value: "business_registration", label: "Business registration" },
  { value: "insurance", label: "Insurance certificate" },
  { value: "tax_clearance", label: "Tax clearance" },
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
  const [documentType, setDocumentType] = useState(DOCUMENT_TYPES[0].value);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  const loadDocuments = async () => {
    try {
      const response = await authFetch("/api/operators/documents");
      const result = await response.json();
      if (result.success) setDocuments(result.documents);
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    void loadDocuments();
  }, []);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError("");
    setUploading(true);

    try {
      const base64 = await readFileAsDataUrl(file);
      const response = await authFetch("/api/operators/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectType: "operator",
          subjectId: operatorId,
          documentType,
          file: base64,
        }),
      });
      const result = await response.json();

      if (!result.success) {
        setError(result.error || "Upload failed");
        return;
      }

      await loadDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="surface-card mt-6 p-6">
      <h2 className="text-lg font-bold text-gray-800">Documents</h2>
      <p className="mt-1 text-sm text-gray-600">Upload the paperwork we need to verify your business.</p>

      {error && <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-3">
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
        {loaded && documents.length === 0 && <p className="text-sm text-gray-500">No documents uploaded yet.</p>}
        {documents.map((doc) => (
          <div key={doc.id} className="flex items-center justify-between rounded-xl border border-gray-100 px-4 py-3">
            <div>
              <p className="text-sm font-semibold capitalize text-gray-800">{doc.document_type.replace(/_/g, " ")}</p>
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
