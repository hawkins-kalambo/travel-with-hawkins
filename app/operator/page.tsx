"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { authFetch } from "@/lib/auth";
import DocumentsPanel from "./_components/DocumentsPanel";
import FleetPanel from "./_components/FleetPanel";
import OperatorHeader from "./_components/OperatorHeader";
import StaffPanel from "./_components/StaffPanel";

type OperatorMe = {
  operator: {
    id: string;
    legalName: string;
    displayName: string;
    isIndividual: boolean;
    applicationStatus: string;
    status: string;
    paychanguConnectStatus: string;
    createdAt: string;
  };
  serviceApprovals: { service_type: string; status: string }[];
  staffRole: string;
  permissions: string[];
};

const APPLICATION_STATUS_COPY: Record<string, { label: string; tone: string; message: string }> = {
  submitted: {
    label: "Application submitted",
    tone: "bg-amber-50 text-amber-800",
    message: "Our team is reviewing your application. We'll be in touch if we need anything else from you.",
  },
  under_review: {
    label: "Under review",
    tone: "bg-amber-50 text-amber-800",
    message: "Your application is being actively reviewed.",
  },
  changes_required: {
    label: "Changes required",
    tone: "bg-orange-50 text-orange-800",
    message: "We need a few changes before we can approve your application. Check your email for details.",
  },
  rejected: {
    label: "Not approved",
    tone: "bg-red-50 text-red-800",
    message: "Your application was not approved at this time.",
  },
  approved: {
    label: "Approved",
    tone: "bg-green-50 text-green-800",
    message: "You're approved. Set up your fleet and documents below.",
  },
};

export default function OperatorDashboardPage() {
  const [data, setData] = useState<OperatorMe | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await authFetch("/api/operators/me");
        const result = await response.json();

        if (!result.success) {
          if (!cancelled) setError(result.error || "Unable to load operator");
          return;
        }

        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load operator");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f3f7fb] px-4">
        <div className="flex flex-col items-center gap-3">
          <Image src="/logo.png" width={48} height={48} className="animate-pulse rounded-full object-cover" alt="Travel with Hawkins logo" />
          <p className="text-sm font-semibold text-slate-500">Loading your dashboard…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f3f7fb] px-4">
        <div className="w-full max-w-lg rounded-[28px] border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-red-600">Error</p>
          <h1 className="mt-3 text-2xl font-black text-slate-900">Couldn&apos;t load your dashboard</h1>
          <p className="mt-3 text-slate-600">{error || "Please try signing in again."}</p>
        </div>
      </div>
    );
  }

  const statusCopy = APPLICATION_STATUS_COPY[data.operator.applicationStatus] ?? {
    label: data.operator.applicationStatus,
    tone: "bg-gray-100 text-gray-700",
    message: "",
  };

  return (
    <div className="min-h-screen bg-[#f3f7fb]">
      <OperatorHeader displayName={data.operator.displayName} staffRole={data.staffRole} />

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <span className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${statusCopy.tone}`}>{statusCopy.label}</span>
          {statusCopy.message && <p className="mt-3 text-slate-600">{statusCopy.message}</p>}

          <dl className="mt-6 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Your role</dt>
              <dd className="font-semibold capitalize text-slate-900">{data.staffRole.replace("_", " ")}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Operator status</dt>
              <dd className="font-semibold capitalize text-slate-900">{data.operator.status}</dd>
            </div>
            <div>
              <dt className="text-slate-500">PayChangu Connect</dt>
              <dd className="font-semibold capitalize text-slate-900">{data.operator.paychanguConnectStatus.replace("_", " ")}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Services applied for</dt>
              <dd className="font-semibold capitalize text-slate-900">
                {data.serviceApprovals.map((s) => `${s.service_type} (${s.status})`).join(", ") || "None"}
              </dd>
            </div>
          </dl>
        </div>

        {(data.permissions.includes("manageVehicles") || data.permissions.includes("manageDrivers")) && <FleetPanel />}
        {data.permissions.includes("manageDocuments") && <DocumentsPanel operatorId={data.operator.id} />}
        {data.permissions.includes("manageStaff") && <StaffPanel ownStaffRole={data.staffRole} />}

        {data.operator.status === "active" && (
          <div className="mt-6 rounded-[28px] border border-dashed border-slate-300 bg-white p-6 text-center text-slate-500 sm:p-8">
            Route and trip management is coming soon.
          </div>
        )}
      </main>
    </div>
  );
}
