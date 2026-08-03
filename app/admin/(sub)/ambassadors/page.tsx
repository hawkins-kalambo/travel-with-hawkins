"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { authFetch } from "@/lib/auth";
import Badge from "@/app/components/ui/Badge";
import PageHeader from "@/app/components/ui/PageHeader";
import { LoadingState } from "@/app/components/ui/Spinner";
import { ambassadorStatusTone } from "@/lib/statusTones";

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
  return <Badge tone={ambassadorStatusTone(status)}>{status || "Active"}</Badge>;
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
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <LoadingState label="Loading ambassador management…" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin control" title="Ambassador management" description="Monitor, verify, and manage all ambassadors from one central operations dashboard." />

      <div className="mx-auto space-y-6">
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

        <div className="min-w-0 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full table-fixed divide-y divide-slate-200 text-sm 2xl:table-auto">
              <thead className="bg-slate-50">
                <tr>
                  <th className="w-[22%] px-3 py-3 text-left font-semibold text-slate-700 2xl:w-auto">Profile</th>
                  <th className="w-[14%] px-3 py-3 text-left font-semibold text-slate-700 2xl:w-auto">Ambassador ID</th>
                  <th className="w-[15%] px-3 py-3 text-left font-semibold text-slate-700 2xl:w-auto">University</th>
                  <th className="hidden px-3 py-3 text-left font-semibold text-slate-700 2xl:table-cell">Programme</th>
                  <th className="hidden px-3 py-3 text-left font-semibold text-slate-700 2xl:table-cell">Phone</th>
                  <th className="hidden px-3 py-3 text-left font-semibold text-slate-700 2xl:table-cell">Email</th>
                  <th className="w-[12%] px-3 py-3 text-left font-semibold text-slate-700 2xl:w-auto">Status</th>
                  <th className="hidden px-3 py-3 text-left font-semibold text-slate-700 2xl:table-cell">Joined</th>
                  <th className="w-[8%] px-3 py-3 text-left font-semibold text-slate-700 2xl:w-auto">Referrals</th>
                  <th className="w-[15%] px-3 py-3 text-left font-semibold text-slate-700 2xl:w-auto">Commission</th>
                  <th className="hidden px-3 py-3 text-left font-semibold text-slate-700 2xl:table-cell">Last login</th>
                  <th className="sticky right-0 z-10 w-[14%] bg-slate-50 px-3 py-3 text-right font-semibold text-slate-700 2xl:w-auto">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedAmbassadors.map((ambassador) => {
                  const performance = stats.get(ambassador.id) || { referrals: 0, commission: 0 };
                  return (
                    <tr key={ambassador.id} className="group hover:bg-slate-50">
                      <td className="px-3 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-slate-100">
                            {ambassador.profile_image_url ? (
                              <Image src={ambassador.profile_image_url} alt={ambassador.full_name || "Ambassador profile"} width={40} height={40} className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-xs font-bold text-slate-500">TH</div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-900" title={ambassador.full_name || "Unnamed ambassador"}>{ambassador.full_name || "Unnamed ambassador"}</p>
                            <p className="text-xs text-slate-500">{ambassador.is_verified ? "Verified" : "Unverified"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="truncate px-3 py-3 font-semibold text-slate-700" title={ambassador.referral_code || ambassador.id.slice(0, 8)}>{ambassador.referral_code || ambassador.id.slice(0, 8)}</td>
                      <td className="truncate px-3 py-3 text-slate-600" title={ambassador.university || undefined}>{ambassador.university || "—"}</td>
                      <td className="hidden truncate px-3 py-3 text-slate-600 2xl:table-cell" title={ambassador.program || undefined}>{ambassador.program || "—"}</td>
                      <td className="hidden px-3 py-3 text-slate-600 2xl:table-cell">{ambassador.phone || "—"}</td>
                      <td className="hidden truncate px-3 py-3 text-slate-600 2xl:table-cell" title={ambassador.email || undefined}>{ambassador.email || "—"}</td>
                      <td className="px-3 py-3">{statusBadge(ambassador.status)}</td>
                      <td className="hidden px-3 py-3 text-slate-600 2xl:table-cell">{formatDate(ambassador.created_at)}</td>
                      <td className="px-3 py-3 font-semibold text-slate-900">{performance.referrals}</td>
                      <td className="px-3 py-3 font-semibold text-slate-900">{formatCurrency(performance.commission)}</td>
                      <td className="hidden px-3 py-3 text-slate-600 2xl:table-cell">{formatDate(ambassador.last_login)}</td>
                      <td className="sticky right-0 bg-white px-3 py-3 text-right group-hover:bg-slate-50">
                        <Link href={`/admin/ambassadors/${ambassador.id}`} className="inline-flex whitespace-nowrap rounded-lg bg-primary-700 px-3 py-2 text-xs font-semibold text-white hover:bg-primary-800">
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
