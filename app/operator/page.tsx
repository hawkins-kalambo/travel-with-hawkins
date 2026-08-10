"use client";

import { useEffect, useState } from "react";
import { authFetch, logout } from "@/lib/auth";

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
    message: "You're approved. Vehicle, driver, and route setup is coming soon.",
  },
};

export default function OperatorDashboardPage() {
  const [data, setData] = useState<OperatorMe | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
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
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="page-shell flex min-h-screen items-center justify-center px-4">
        <p className="text-gray-500">Loading…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="page-shell flex min-h-screen items-center justify-center px-4">
        <div className="surface-card w-full max-w-lg p-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-red-600">Error</p>
          <h1 className="mt-3 text-2xl font-extrabold text-gray-800">Couldn&apos;t load your dashboard</h1>
          <p className="mt-3 text-gray-600">{error || "Please try signing in again."}</p>
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
    <div className="page-shell min-h-screen px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-primary-600">Operator portal</p>
            <h1 className="mt-1 text-2xl font-extrabold text-gray-800">{data.operator.displayName}</h1>
          </div>
          <button
            onClick={async () => {
              await logout();
              window.location.assign("/operator/login");
            }}
            className="btn-secondary"
          >
            Sign out
          </button>
        </div>

        <div className="surface-card mt-6 p-6">
          <span className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${statusCopy.tone}`}>{statusCopy.label}</span>
          {statusCopy.message && <p className="mt-3 text-gray-600">{statusCopy.message}</p>}

          <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-gray-500">Your role</dt>
              <dd className="font-semibold capitalize text-gray-800">{data.staffRole.replace("_", " ")}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Operator status</dt>
              <dd className="font-semibold capitalize text-gray-800">{data.operator.status}</dd>
            </div>
            <div>
              <dt className="text-gray-500">PayChangu Connect</dt>
              <dd className="font-semibold capitalize text-gray-800">{data.operator.paychanguConnectStatus.replace("_", " ")}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Services applied for</dt>
              <dd className="font-semibold capitalize text-gray-800">
                {data.serviceApprovals.map((s) => `${s.service_type} (${s.status})`).join(", ") || "None"}
              </dd>
            </div>
          </dl>
        </div>

        {data.operator.status === "active" && (
          <div className="surface-card mt-6 p-6 text-center text-gray-500">
            Vehicle, driver, and route management is coming soon.
          </div>
        )}
      </div>
    </div>
  );
}
