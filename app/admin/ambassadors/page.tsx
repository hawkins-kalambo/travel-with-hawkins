"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { authFetch } from "@/lib/auth";

const PAGE_SIZE = 10;

type AmbassadorRecord = {
  id: string;
  profile_id?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  university?: string | null;
  program?: string | null;
  faculty?: string | null;
  year_of_study?: number | null;
  referral_code?: string | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_login?: string | null;
  is_verified?: boolean | null;
  suspension_reason?: string | null;
  profile_image_url?: string | null;
};

type ReferralRecord = {
  id: string;
  ambassador_id?: string | null;
  commission_amount?: number | string | null;
  commission_status?: string | null;
  created_at?: string | null;
};

function statusBadge(status?: string | null) {
  const normalized = String(status || "active").toLowerCase();
  const classes: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-700 border-emerald-200",
    inactive: "bg-slate-100 text-slate-700 border-slate-200",
    suspended: "bg-red-50 text-red-700 border-red-200",
    "pending verification": "bg-amber-50 text-amber-700 border-amber-200",
  };

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${classes[normalized] ?? classes.active}`}>
      {status || "Active"}
    </span>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
}

function formatCurrency(value: number) {
  return `MWK ${value.toLocaleString()}`;
}

export default function AdminAmbassadorsPage() {
  const [ambassadors, setAmbassadors] = useState<AmbassadorRecord[]>([]);
  const [referrals, setReferrals] = useState<ReferralRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [universityFilter, setUniversityFilter] = useState("all");
  const [sortMode, setSortMode] = useState("newest");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const load = async () => {
      try {
        const [ambassadorsRes, referralsRes] = await Promise.all([
          authFetch("/api/ambassadors", { method: "GET" }),
          authFetch("/api/referrals", { method: "GET" }),
        ]);

        if (!ambassadorsRes.ok) throw new Error("Failed to load ambassadors");
        if (!referralsRes.ok) throw new Error("Failed to load referrals");

        const ambassadorsData = (await ambassadorsRes.json()) as { ambassadors?: AmbassadorRecord[] };
        const referralsData = (await referralsRes.json()) as { referrals?: ReferralRecord[] };

        setAmbassadors(Array.isArray(ambassadorsData.ambassadors) ? ambassadorsData.ambassadors : []);
        setReferrals(Array.isArray(referralsData.referrals) ? referralsData.referrals : []);
      } catch (error) {
        console.error("Failed to load ambassador management data", error);
      } finally {
        setLoading(false);
      }
    };

    void load();

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void load();
      }
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, []);

  const stats = useMemo(() => {
    const referralCounts = referrals.reduce<Record<string, number>>((bucket, referral) => {
      const ambassadorId = referral.ambassador_id;
      if (!ambassadorId) return bucket;
      bucket[ambassadorId] = (bucket[ambassadorId] || 0) + 1;
      return bucket;
    }, {});

    const commissionTotals = referrals.reduce<Record<string, number>>((bucket, referral) => {
      const ambassadorId = referral.ambassador_id;
      if (!ambassadorId) return bucket;
      bucket[ambassadorId] = (bucket[ambassadorId] || 0) + Number(referral.commission_amount || 0);
      return bucket;
    }, {});

    return new Map(
      ambassadors.map((ambassador) => {
        const ambassadorId = ambassador.id;
        return [ambassadorId, { referrals: referralCounts[ambassadorId] || 0, commission: commissionTotals[ambassadorId] || 0 }];
      })
    );
  }, [ambassadors, referrals]);

  const visibleAmbassadors = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    const rows = ambassadors.filter((ambassador) => {
      const matchesSearch = !normalizedSearch || [
        ambassador.full_name,
        ambassador.email,
        ambassador.phone,
        ambassador.university,
        ambassador.referral_code,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedSearch));

      const matchesStatus = statusFilter === "all" || String(ambassador.status || "active").toLowerCase() === statusFilter;
      const matchesUniversity = universityFilter === "all" || String(ambassador.university || "").toLowerCase() === universityFilter;

      return matchesSearch && matchesStatus && matchesUniversity;
    });

    rows.sort((left, right) => {
      const leftStats = stats.get(left.id) || { referrals: 0, commission: 0 };
      const rightStats = stats.get(right.id) || { referrals: 0, commission: 0 };

      if (sortMode === "highest-referrals") {
        return rightStats.referrals - leftStats.referrals;
      }
      if (sortMode === "highest-commission") {
        return rightStats.commission - leftStats.commission;
      }
      if (sortMode === "last-active") {
        return new Date(right.last_login || right.updated_at || 0).getTime() - new Date(left.last_login || left.updated_at || 0).getTime();
      }
      return new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime();
    });

    return rows;
  }, [ambassadors, search, statusFilter, universityFilter, sortMode, stats]);

  const totalPages = Math.max(1, Math.ceil(visibleAmbassadors.length / PAGE_SIZE));
  const pagedAmbassadors = useMemo(() => {
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * PAGE_SIZE;
    return visibleAmbassadors.slice(start, start + PAGE_SIZE);
  }, [page, totalPages, visibleAmbassadors]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, universityFilter, sortMode]);

  const universityOptions = useMemo(() => {
    const universities = new Set(
      ambassadors
        .map((ambassador) => ambassador.university)
        .filter(Boolean)
        .map((value) => String(value))
    );
    return Array.from(universities).sort((left, right) => left.localeCompare(right));
  }, [ambassadors]);

  if (loading) {
    return <div className="min-h-screen bg-slate-50 p-6 text-sm text-slate-500">Loading ambassador management…</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#0f3f78]">Admin control</p>
              <h1 className="mt-2 text-3xl font-black text-slate-900">Ambassador management</h1>
              <p className="mt-2 text-sm text-slate-500">Monitor, verify, and manage all ambassadors from one central operations dashboard.</p>
            </div>
            <Link href="/admin" className="inline-flex rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Back to admin
            </Link>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Total ambassadors", ambassadors.length],
            ["Active ambassadors", ambassadors.filter((ambassador) => String(ambassador.status || "active").toLowerCase() === "active").length],
            ["Verified ambassadors", ambassadors.filter((ambassador) => ambassador.is_verified === true).length],
            ["Commission tracked", formatCurrency(Array.from(stats.values()).reduce((sum, item) => sum + item.commission, 0))],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
              <p className="mt-2 text-2xl font-black text-slate-900">{value}</p>
            </div>
          ))}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-5">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, email, phone, university or ID"
              className="input-field lg:col-span-2"
            />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="input-field">
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
              <option value="pending verification">Pending verification</option>
            </select>
            <select value={universityFilter} onChange={(event) => setUniversityFilter(event.target.value)} className="input-field">
              <option value="all">All universities</option>
              {universityOptions.map((university) => (
                <option key={university} value={university.toLowerCase()}>{university}</option>
              ))}
            </select>
            <select value={sortMode} onChange={(event) => setSortMode(event.target.value)} className="input-field">
              <option value="newest">Newest ambassadors</option>
              <option value="highest-referrals">Highest referrals</option>
              <option value="highest-commission">Highest commission</option>
              <option value="last-active">Last active</option>
            </select>
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Profile</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Ambassador ID</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">University</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Programme</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Phone</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Email</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Joined</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Referrals</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Commission</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Last login</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedAmbassadors.map((ambassador) => {
                  const performance = stats.get(ambassador.id) || { referrals: 0, commission: 0 };
                  return (
                    <tr key={ambassador.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 overflow-hidden rounded-full bg-slate-100">
                            {ambassador.profile_image_url ? (
                              <img src={ambassador.profile_image_url} alt={ambassador.full_name || "Ambassador profile"} className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-xs font-bold text-slate-500">TH</div>
                            )}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900">{ambassador.full_name || "Unnamed ambassador"}</p>
                            <p className="text-xs text-slate-500">{ambassador.is_verified ? "Verified" : "Unverified"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-700">{ambassador.referral_code || ambassador.id.slice(0, 8)} </td>
                      <td className="px-4 py-3 text-slate-600">{ambassador.university || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{ambassador.program || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{ambassador.phone || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{ambassador.email || "—"}</td>
                      <td className="px-4 py-3">{statusBadge(ambassador.status)}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(ambassador.created_at)}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{performance.referrals}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{formatCurrency(performance.commission)}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(ambassador.last_login)}</td>
                      <td className="px-4 py-3">
                        <Link href={`/admin/ambassadors/${ambassador.id}`} className="rounded-lg bg-[#0f3f78] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0a2d56]">
                          View profile
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {visibleAmbassadors.length > PAGE_SIZE && (
          <div className="flex items-center justify-between rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-500">Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, visibleAmbassadors.length)} of {visibleAmbassadors.length} ambassadors</p>
            <div className="flex gap-2">
              <button onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">Previous</button>
              <button onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
