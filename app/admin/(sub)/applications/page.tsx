"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { authFetch } from "@/lib/auth";
import {
  IconCheck,
  IconClipboard,
  IconDownload,
  IconInfo,
  IconMail,
  IconPhone,
  IconSearch,
  IconShield,
  IconX,
} from "@/app/components/Icon";
import Badge from "@/app/components/ui/Badge";
import ConfirmDialog from "@/app/components/ui/ConfirmDialog";
import { applicationStatusTone } from "@/lib/statusTones";

type Application = {
  id: string;
  full_name: string;
  student_id: string;
  email: string;
  phone?: string | null;
  whatsapp_number?: string | null;
  university?: string | null;
  faculty?: string | null;
  program: string;
  year_of_study?: number | null;
  profile_image_url?: string | null;
  motivation?: string | null;
  leadership_experience?: string | null;
  marketing_experience?: string | null;
  social_media_influence?: string | null;
  communities?: string | null;
  status: string;
  created_at?: string;
  updated_at?: string;
  reviewed_at?: string;
  rejection_reason?: string | null;
};

type ApprovalPayload = {
  ambassadorId?: string;
  referralCode?: string;
  referralLink?: string;
  username?: string;
  temporaryPassword?: string;
  email?: string;
  fullName?: string;
};

type SortOption = "newest" | "oldest" | "updated";

const initialStats = {
  pending: 0,
  approved: 0,
  rejected: 0,
  total: 0,
  thisWeek: 0,
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function getInitials(fullName: string) {
  return fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "TH";
}

function getTimelineLabel(status: string) {
  const normalized = String(status || "pending").toLowerCase();
  if (normalized === "approved") return "Approved";
  if (normalized === "rejected") return "Rejected";
  return "Under review";
}

export default function AdminApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null);
  const [statistics, setStatistics] = useState(initialStats);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [universityFilter, setUniversityFilter] = useState("all");
  const [programFilter, setProgramFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [approvalPayload, setApprovalPayload] = useState<ApprovalPayload | null>(null);
  const [copied, setCopied] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ id: string; action: "approve" | "reject" } | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }

    try {
      const res = await authFetch("/api/applications");
      const body = (await res.json()) as { success?: boolean; error?: string; applications?: Application[] };
      if (!res.ok || !body?.success) throw new Error(body?.error || "Failed to load applications");
      const next: Application[] = Array.isArray(body.applications) ? body.applications : [];
      const nextStats = { ...initialStats };
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      for (const application of next) {
        const status = String(application.status || "pending").toLowerCase();
        if (status === "pending") nextStats.pending += 1;
        if (status === "approved") nextStats.approved += 1;
        if (status === "rejected") nextStats.rejected += 1;
        nextStats.total += 1;
        const createdAt = application.created_at ? new Date(application.created_at).getTime() : null;
        if (createdAt && createdAt >= weekAgo.getTime()) {
          nextStats.thisWeek += 1;
        }
      }
      setApplications(next);
      setStatistics(nextStats);
      setSelectedIds((current) => current.filter((id) => next.some((application) => application.id === id)));
      setSelectedApplication((current) => (current ? next.find((application) => application.id === current.id) ?? null : null));
    } catch (err) {
      console.error(err);
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void load(false);

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void load(true);
      }
    }, 30000);

    const handleVisibility = () => {
      if (!document.hidden) {
        void load(true);
      }
    };

    const handleFocus = () => {
      void load(true);
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
    };
  }, [load]);

  const universities = useMemo(
    () => Array.from(new Set(applications.map((app) => String(app.university || "Unknown").trim()))).sort(),
    [applications]
  );

  const programs = useMemo(
    () => Array.from(new Set(applications.map((app) => String(app.program || "Unknown").trim()))).sort(),
    [applications]
  );

  const filteredApplications = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return [...applications]
      .filter((app) => {
        const status = String(app.status || "pending").toLowerCase();
        if (statusFilter !== "all" && status !== statusFilter) return false;
        if (universityFilter !== "all" && String(app.university || "unknown").toLowerCase() !== universityFilter.toLowerCase()) return false;
        if (programFilter !== "all" && String(app.program || "unknown").toLowerCase() !== programFilter.toLowerCase()) return false;
        if (dateFilter && !String(app.created_at || "").slice(0, 10).includes(dateFilter)) return false;
        if (!normalizedSearch) return true;
        const candidateFields = [app.full_name, app.student_id, app.email, app.university, app.program]
          .map((value) => String(value || "").toLowerCase());
        return candidateFields.some((value) => value.includes(normalizedSearch));
      })
      .sort((a, b) => {
        const first = new Date(a.created_at || a.updated_at || 0).getTime();
        const second = new Date(b.created_at || b.updated_at || 0).getTime();
        if (sortBy === "oldest") return first - second;
        if (sortBy === "updated") {
          const updatedA = new Date(a.updated_at || a.reviewed_at || a.created_at || 0).getTime();
          const updatedB = new Date(b.updated_at || b.reviewed_at || b.created_at || 0).getTime();
          return updatedB - updatedA;
        }
        return second - first;
      });
  }, [applications, dateFilter, programFilter, searchTerm, sortBy, statusFilter, universityFilter]);

  const selectedApplicationDetails = selectedApplication;

  const renderStatusTag = (status: string) => {
    const normalized = String(status || "pending").toLowerCase();
    const label = normalized === "approved" ? "Approved" : normalized === "rejected" ? "Rejected" : "Pending";
    return <Badge tone={applicationStatusTone(normalized)}>{label}</Badge>;
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const exportApplications = () => {
    const rows = filteredApplications.length ? filteredApplications : applications;
    const headers = [
      "Full Name",
      "Student ID",
      "Email",
      "Phone",
      "University",
      "Program",
      "Status",
      "Applied At",
    ];
    const csv = [headers.join(",")]
      .concat(
        rows.map((row) =>
          [
            row.full_name,
            row.student_id,
            row.email,
            row.phone ?? "",
            row.university ?? "",
            row.program,
            row.status,
            row.created_at ?? "",
          ]
            .map((value) => `"${String(value).replaceAll('"', '""')}"`)
            .join(",")
        )
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "ambassador_applications.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const requestAction = (id: string, action: "approve" | "reject") => {
    setPendingAction({ id, action });
  };

  const confirmAction = async (rejectionReason?: string) => {
    if (!pendingAction) return;
    const { id, action } = pendingAction;

    setProcessingId(id);
    try {
      const res = await authFetch("/api/applications/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId: id, action, rejectionReason }),
      });
      const body = await res.json();
      if (!res.ok || !body?.success) throw new Error(body?.error || "Action failed");
      setPendingAction(null);
      if (action === "approve" && body?.result) {
        setApprovalPayload(body.result as ApprovalPayload);
        const ambassadorId = (body.result as ApprovalPayload).ambassadorId;
        if (ambassadorId) {
          window.location.href = `/admin/ambassadors/${ambassadorId}`;
          return;
        }
      }
      setMessage(action === "approve" ? "Application approved and ambassador account created." : "Application rejected.");
      await load();
      const refreshed = applications.find((application) => application.id === id);
      setSelectedApplication(refreshed ?? null);
    } catch (err) {
      console.error(err);
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setProcessingId(null);
    }
  };

  const copyCredentials = async () => {
    if (!approvalPayload) return;
    const text = [
      `Ambassador ID: ${approvalPayload.ambassadorId ?? "—"}`,
      `Username: ${approvalPayload.username ?? approvalPayload.email ?? "—"}`,
      `Temporary Password: ${approvalPayload.temporaryPassword ?? "—"}`,
      `Referral Link: ${approvalPayload.referralLink ?? "—"}`,
    ].join("\n");

    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const closeProfile = () => setSelectedApplication(null);
  const openProfileRedirect = () => {
    window.location.href = "/admin";
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_-24px_rgba(10,77,140,0.35)] md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#0a4d8c]">Admin recruitment workspace</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900 md:text-4xl">Ambassador Applications</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600 md:text-base">
              Manage, review and approve Campus Ambassador applications with a recruitment-style workflow tailored for Travel with Hawkins.
            </p>
          </div>
          <div className="flex flex-col gap-3 lg:items-end">
            <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
              {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={exportApplications}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-[#0a4d8c] hover:text-[#0a4d8c]"
              >
                <IconDownload className="h-4 w-4" />
                Export Applications
              </button>
              <button
                type="button"
                onClick={() => void load()}
                className="inline-flex items-center gap-2 rounded-full bg-[#0a4d8c] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#083a6b]"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "Pending Applications", value: statistics.pending, tone: "orange", icon: "⏳" },
          { label: "Approved", value: statistics.approved, tone: "green", icon: "✓" },
          { label: "Rejected", value: statistics.rejected, tone: "red", icon: "✕" },
          { label: "Total Applications", value: statistics.total, tone: "blue", icon: "▣" },
          { label: "Applications This Week", value: statistics.thisWeek, tone: "purple", icon: "↗" },
        ].map((card) => (
          <div
            key={card.label}
            className="group rounded-[20px] border border-slate-200 bg-white p-4 shadow-[0_10px_40px_-26px_rgba(15,23,42,0.35)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_18px_45px_-24px_rgba(10,77,140,0.45)]"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-600">{card.label}</p>
                <p className="mt-3 text-3xl font-black text-slate-900">{card.value}</p>
              </div>
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-2xl text-lg font-bold ${
                  card.tone === "orange"
                    ? "bg-orange-100 text-orange-500"
                    : card.tone === "green"
                      ? "bg-emerald-100 text-emerald-600"
                      : card.tone === "red"
                        ? "bg-red-100 text-red-600"
                        : card.tone === "purple"
                          ? "bg-violet-100 text-violet-600"
                          : "bg-blue-100 text-[#0a4d8c]"
                }`}
              >
                {card.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_18px_45px_-24px_rgba(10,77,140,0.35)] md:p-6">
        <div className="grid gap-3 xl:grid-cols-[1.4fr_0.9fr_0.9fr_0.9fr_0.85fr]">
          <label className="relative block">
            <span className="sr-only">Search applications</span>
            <IconSearch className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-900 outline-none transition focus:border-[#0a4d8c] focus:bg-white"
              placeholder="Search by name, student ID, or email"
            />
          </label>

          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#0a4d8c]">
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>

          <select value={universityFilter} onChange={(event) => setUniversityFilter(event.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#0a4d8c]">
            <option value="all">All universities</option>
            {universities.map((university) => (
              <option key={university} value={university}>{university}</option>
            ))}
          </select>

          <select value={programFilter} onChange={(event) => setProgramFilter(event.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#0a4d8c]">
            <option value="all">All programmes</option>
            {programs.map((program) => (
              <option key={program} value={program}>{program}</option>
            ))}
          </select>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
            <input value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} type="date" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#0a4d8c]" />
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortOption)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#0a4d8c]">
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="updated">Recently Updated</option>
            </select>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <div>
            Showing {filteredApplications.length} of {applications.length} applications
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selectedIds.length > 0 && filteredApplications.every((app) => selectedIds.includes(app.id))}
              onChange={() => {
                const ids = filteredApplications.map((app) => app.id);
                const allSelected = ids.every((id) => selectedIds.includes(id));
                setSelectedIds((current) => (allSelected ? current.filter((id) => !ids.includes(id)) : Array.from(new Set([...current, ...ids]))));
              }}
              className="h-4 w-4 rounded border-slate-300 text-[#0a4d8c] focus:ring-[#0a4d8c]"
            />
            <span>Select visible</span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.55fr_0.85fr]">
        <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_45px_-24px_rgba(10,77,140,0.35)]">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-3"><span className="sr-only">Select</span></th>
                  <th className="px-3 py-3">Profile Photo</th>
                  <th className="px-3 py-3">Full Name</th>
                  <th className="px-3 py-3">Student ID</th>
                  <th className="px-3 py-3">University</th>
                  <th className="px-3 py-3">Programme</th>
                  <th className="px-3 py-3">Email</th>
                  <th className="px-3 py-3">Phone</th>
                  <th className="px-3 py-3">Application Date</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center text-slate-500">
                      Loading applications…
                    </td>
                  </tr>
                ) : filteredApplications.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center text-slate-500">
                      No applications match the current filters.
                    </td>
                  </tr>
                ) : (
                  filteredApplications.map((application) => (
                    <tr
                      key={application.id}
                      onClick={() => setSelectedApplication(application)}
                      className="cursor-pointer border-t border-slate-100 transition hover:bg-[#f8fbff]"
                    >
                      <td className="px-3 py-3" onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-[#0a4d8c] focus:ring-[#0a4d8c]"
                          checked={selectedIds.includes(application.id)}
                          onChange={() => toggleSelected(application.id)}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-[#edf5ff]">
                          {application.profile_image_url ? (
                            <img src={application.profile_image_url} alt={application.full_name} className="h-full w-full object-cover" />
                          ) : (
                            <span className="text-sm font-bold text-[#0a4d8c]">{getInitials(application.full_name)}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-900">{application.full_name}</td>
                      <td className="px-3 py-3 text-slate-600">{application.student_id}</td>
                      <td className="px-3 py-3 text-slate-600">{application.university || "—"}</td>
                      <td className="px-3 py-3 text-slate-600">{application.program}</td>
                      <td className="px-3 py-3 text-slate-600">{application.email}</td>
                      <td className="px-3 py-3 text-slate-600">{application.phone || "—"}</td>
                      <td className="px-3 py-3 text-slate-600">{formatDate(application.created_at)}</td>
                      <td className="px-3 py-3">{renderStatusTag(application.status)}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              requestAction(application.id, "approve");
                            }}
                            disabled={processingId === application.id || application.status !== "pending"}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#0a4d8c] text-white transition hover:bg-[#083a6b] disabled:opacity-50"
                          >
                            <IconCheck className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              requestAction(application.id, "reject");
                            }}
                            disabled={processingId === application.id || application.status !== "pending"}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                          >
                            <IconX className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {selectedApplicationDetails ? (
          <aside className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_-24px_rgba(10,77,140,0.35)] md:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#0a4d8c]">Application detail</p>
                <h2 className="mt-2 text-2xl font-black text-slate-900">{selectedApplicationDetails.full_name}</h2>
                <p className="mt-1 text-sm text-slate-500">{selectedApplicationDetails.student_id} • {selectedApplicationDetails.university || "—"}</p>
              </div>
              <button type="button" onClick={closeProfile} className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200">
                Close
              </button>
            </div>

            <div className="mt-5 flex items-center gap-4 rounded-[20px] bg-[#f8fbff] p-4">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-white shadow-sm">
                {selectedApplicationDetails.profile_image_url ? (
                  <img src={selectedApplicationDetails.profile_image_url} alt={selectedApplicationDetails.full_name} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-lg font-black text-[#0a4d8c]">{getInitials(selectedApplicationDetails.full_name)}</span>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-1 text-sm text-slate-700">
                <div className="flex items-center gap-2">
                  <IconMail className="h-4 w-4 text-slate-400" />
                  <span>{selectedApplicationDetails.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <IconPhone className="h-4 w-4 text-slate-400" />
                  <span>{selectedApplicationDetails.phone || "—"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <IconShield className="h-4 w-4 text-slate-400" />
                  <span>{selectedApplicationDetails.status}</span>
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Faculty</p>
                <p className="mt-2 font-semibold text-slate-900">{selectedApplicationDetails.faculty || "—"}</p>
              </div>
              <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Year of study</p>
                <p className="mt-2 font-semibold text-slate-900">{selectedApplicationDetails.year_of_study ?? "—"}</p>
              </div>
            </div>

            <div className="mt-5 rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-[#0a4d8c]">
                <IconInfo className="h-4 w-4" />
                <p className="text-sm font-semibold">Why do you want to become a Travel with Hawkins Campus Ambassador?</p>
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-700">{selectedApplicationDetails.motivation || "No motivation record available."}</p>
            </div>

            <div className="mt-4 grid gap-4">
              <div className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-sm font-semibold text-slate-900">Leadership Experience</p>
                <p className="mt-2 text-sm leading-7 text-slate-700">{selectedApplicationDetails.leadership_experience || "No details provided."}</p>
              </div>
              <div className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-sm font-semibold text-slate-900">Marketing Experience</p>
                <p className="mt-2 text-sm leading-7 text-slate-700">{selectedApplicationDetails.marketing_experience || "No details provided."}</p>
              </div>
              <div className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-sm font-semibold text-slate-900">Student Communities</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedApplicationDetails.communities ? (
                    selectedApplicationDetails.communities
                      .split(/[\n,]+/)
                      .map((entry) => entry.trim())
                      .filter(Boolean)
                      .map((entry) => (
                        <span key={entry} className="rounded-full border border-[#d7ebff] bg-[#f8fbff] px-3 py-1 text-xs font-semibold text-[#0a4d8c]">
                          {entry}
                        </span>
                      ))
                  ) : (
                    <span className="text-sm text-slate-500">No communities listed.</span>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-[20px] border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">Application timeline</p>
              <div className="mt-3 space-y-3">
                <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm">
                  <span>Application Submitted</span>
                  <span className="font-semibold text-slate-900">{formatDate(selectedApplicationDetails.created_at)}</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm">
                  <span>Under Review</span>
                  <span className="font-semibold text-slate-900">{getTimelineLabel(selectedApplicationDetails.status)}</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm">
                  <span>Approved / Rejected</span>
                  <span className="font-semibold text-slate-900">{formatDate(selectedApplicationDetails.reviewed_at)}</span>
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => requestAction(selectedApplicationDetails.id, "approve")}
                disabled={processingId === selectedApplicationDetails.id || selectedApplicationDetails.status !== "pending"}
                className="inline-flex items-center gap-2 rounded-full bg-[#0a4d8c] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#083a6b] disabled:opacity-50"
              >
                <IconCheck className="h-4 w-4" />
                Approve
              </button>
              <button
                type="button"
                onClick={() => requestAction(selectedApplicationDetails.id, "reject")}
                disabled={processingId === selectedApplicationDetails.id || selectedApplicationDetails.status !== "pending"}
                className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
              >
                <IconX className="h-4 w-4" />
                Reject
              </button>
              <a
                href={`mailto:${selectedApplicationDetails.email}`}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                <IconMail className="h-4 w-4" />
                Request More Information
              </a>
            </div>
          </aside>
        ) : null}
      </div>

      {message ? (
        <div className="rounded-[20px] border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">
          {message}
        </div>
      ) : null}

      {approvalPayload ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <div className="w-full max-w-2xl rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_20px_70px_-24px_rgba(15,23,42,0.45)]">
            <div className="flex items-center gap-3 rounded-[22px] bg-emerald-50 p-4 text-emerald-800">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl">🎉</div>
              <div>
                <p className="text-lg font-black">Ambassador Account Created Successfully!</p>
                <p className="text-sm">The ambassador profile and referral workflow are now active.</p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Ambassador ID</p>
                <p className="mt-2 font-semibold text-slate-900">{approvalPayload.ambassadorId || "—"}</p>
              </div>
              <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Username</p>
                <p className="mt-2 font-semibold text-slate-900">{approvalPayload.username || approvalPayload.email || "—"}</p>
              </div>
              <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Temporary Password</p>
                <p className="mt-2 font-semibold text-slate-900">{approvalPayload.temporaryPassword || "Shown only once during approval"}</p>
              </div>
              <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Referral Link</p>
                <p className="mt-2 break-all font-semibold text-slate-900">{approvalPayload.referralLink || "—"}</p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button type="button" onClick={copyCredentials} className="inline-flex items-center gap-2 rounded-full bg-[#0a4d8c] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#083a6b]">
                <IconClipboard className="h-4 w-4" />
                {copied ? "Copied" : "Copy Credentials"}
              </button>
              <button type="button" onClick={openProfileRedirect} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">
                Open Ambassador Profile
              </button>
              <button type="button" onClick={() => setApprovalPayload(null)} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={pendingAction !== null}
        title={pendingAction?.action === "approve" ? "Approve this application?" : "Reject this application?"}
        description={
          pendingAction?.action === "approve"
            ? "This creates the ambassador account, generates a referral code, and emails login credentials."
            : "The applicant will be notified with the reason you provide below."
        }
        confirmLabel={pendingAction?.action === "approve" ? "Approve" : "Reject"}
        danger={pendingAction?.action === "reject"}
        requireReason={pendingAction?.action === "reject"}
        reasonLabel="Reason for rejection"
        reasonPlaceholder="Let the applicant know why their application wasn't approved this time."
        reasonMinLength={5}
        onConfirm={(reason) => confirmAction(reason)}
        onCancel={() => setPendingAction(null)}
      />
    </div>
  );
}
