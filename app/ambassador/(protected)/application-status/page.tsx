"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/auth";
import Card from "@/app/components/ui/Card";
import PageHeader from "@/app/components/ui/PageHeader";
import Badge from "@/app/components/ui/Badge";
import Button from "@/app/components/ui/Button";
import { LoadingState } from "@/app/components/ui/Spinner";
import { applicationStatusTone } from "@/lib/statusTones";

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
    <div className="space-y-6">
      <PageHeader eyebrow="Ambassador Portal" title="Application status" description="Review the current status of your ambassador application." />

      {loading ? (
        <Card>
          <LoadingState label="Loading application status…" />
        </Card>
      ) : error ? (
        <Card className="border-danger/20 bg-danger/5 text-danger">{error}</Card>
      ) : applications.length === 0 ? (
        <Card className="space-y-4">
          <p className="text-gray-700">No ambassador application was found for your account.</p>
          <Button href="/ambassador/apply">Apply now</Button>
        </Card>
      ) : (
        <Card className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-gray-500">Application status</p>
              <Badge tone={applicationStatusTone(status)} className="mt-2 text-sm">
                {status || "Pending"}
              </Badge>
            </div>
            <div className="rounded-full border border-gray-200 bg-gray-100 px-4 py-2 text-sm text-gray-700">
              Submitted: {currentApp?.created_at ? new Date(String(currentApp.created_at)).toLocaleDateString() : "Unknown"}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-gray-100 p-4">
              <p className="text-xs text-gray-500">Full name</p>
              <p className="mt-2 text-sm font-semibold text-gray-800">{String(currentApp?.full_name || "—")}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-100 p-4">
              <p className="text-xs text-gray-500">Email</p>
              <p className="mt-2 text-sm font-semibold text-gray-800">{String(currentApp?.email || "—")}</p>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-100 p-4">
            <p className="text-xs text-gray-500">Application details</p>
            <p className="mt-2 text-sm text-gray-700">Program: {String(currentApp?.program || "—")}</p>
            <p className="mt-1 text-sm text-gray-700">University: {String(currentApp?.university || "—")}</p>
            <p className="mt-1 text-sm text-gray-700">Year of study: {String(currentApp?.year_of_study ?? "—")}</p>
          </div>

          {status === "rejected" && rejectionReason ? (
            <div className="rounded-xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger">
              <p className="font-semibold">Rejection reason</p>
              <p className="mt-2">{rejectionReason}</p>
            </div>
          ) : null}

          {reviewedAt ? (
            <div className="rounded-xl border border-gray-200 bg-gray-100 p-4 text-sm text-gray-600">Reviewed: {new Date(reviewedAt).toLocaleString()}</div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href="/ambassador/apply" className="btn-muted">
              Update application
            </Link>
            <Button href="/ambassador/dashboard">Ambassador dashboard</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
