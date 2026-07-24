"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/auth";

export default function ApplicationStatusPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applications, setApplications] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    const loadStatus = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await authFetch("/api/applications", { method: "GET" });
        const body = await res.json();

        if (!res.ok) {
          throw new Error(body?.error || `HTTP ${res.status}`);
        }

        setApplications(Array.isArray(body?.applications) ? body.applications : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };

    void loadStatus();
  }, []);

  const currentApp = applications[0];
  const status = currentApp?.status ? String(currentApp.status) : null;
  const reviewedAt = currentApp?.reviewed_at ? String(currentApp.reviewed_at) : null;
  const rejectionReason = currentApp?.rejection_reason ? String(currentApp.rejection_reason) : null;

  return (
    <div className="max-w-3xl mx-auto py-12 px-4">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-2">Ambassador Application Status</h1>
        <p className="text-sm text-slate-600">
          Review the current status of your ambassador application. If you haven&apos;t applied yet, start your application below.
        </p>
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm text-slate-600">Loading application status...</div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 shadow-sm text-red-700">{error}</div>
      ) : applications.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <p className="text-slate-700">No ambassador application was found for your account.</p>
          <Link href="/ambassador/apply" className="inline-flex items-center rounded-lg bg-primary-600 px-4 py-2 text-white transition hover:bg-primary-700">
            Apply now
          </Link>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Application status</p>
              <h2 className="text-3xl font-extrabold text-slate-900 capitalize">{status || "Pending"}</h2>
            </div>
            <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">
              Submitted: {currentApp?.created_at ? new Date(String(currentApp.created_at)).toLocaleDateString() : "Unknown"}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs text-slate-500">Full name</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{String(currentApp?.full_name || "—")}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs text-slate-500">Email</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{String(currentApp?.email || "—")}</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs text-slate-500">Application details</p>
            <p className="mt-2 text-sm text-slate-700">Program: {String(currentApp?.program || "—")}</p>
            <p className="mt-1 text-sm text-slate-700">University: {String(currentApp?.university || "—")}</p>
            <p className="mt-1 text-sm text-slate-700">Year of study: {String(currentApp?.year_of_study ?? "—")}</p>
          </div>

          {status === "rejected" && rejectionReason ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <p className="font-semibold">Rejection reason</p>
              <p className="mt-2">{rejectionReason}</p>
            </div>
          ) : null}

          {reviewedAt ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              Reviewed: {new Date(reviewedAt).toLocaleString()}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href="/ambassador/apply" className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50">
              Update application
            </Link>
            <Link href="/ambassador/dashboard" className="inline-flex items-center justify-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700">
              Ambassador dashboard
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
