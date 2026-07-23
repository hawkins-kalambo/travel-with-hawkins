"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/auth";

async function authFetch(input: RequestInfo | URL, init?: RequestInit) {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    const headers = new Headers(init?.headers as HeadersInit | undefined);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(input, { ...init, headers, credentials: "same-origin" });
  } catch {
    return fetch(input, { ...init, credentials: "same-origin" });
  }
}

export default function AdminReferralBookingsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [ambassadors, setAmbassadors] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [ambassadorFilter, setAmbassadorFilter] = useState("all");
  const [routeFilter, setRouteFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    const load = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }

      try {
        const [referralsRes, ambassadorsRes] = await Promise.all([
          authFetch("/api/referrals", { method: "GET" }),
          authFetch("/api/ambassadors", { method: "GET" }),
        ]);

        if (referralsRes.ok) {
          const referralsData = await referralsRes.json();
          setRows(Array.isArray(referralsData?.referrals) ? referralsData.referrals : []);
        }

        if (ambassadorsRes.ok) {
          const ambassadorsData = await ambassadorsRes.json();
          setAmbassadors(Array.isArray(ambassadorsData?.ambassadors) ? ambassadorsData.ambassadors : []);
        }
      } catch (error) {
        console.error("Failed to load referral bookings", error);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [router]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const customerName = String(row.customer_name || "").toLowerCase();
      const phone = String(row.customer_phone || "").toLowerCase();
      const route = String(row.route || "").toLowerCase();
      const ambassadorId = String(row.ambassador_id || "");
      const bookingStatus = String(row.commission_status || row.status || "pending").toLowerCase();
      const date = String(row.created_at || "").slice(0, 10);
      const matchesSearch = !q || customerName.includes(q) || phone.includes(q);
      const matchesAmbassador = ambassadorFilter === "all" || ambassadorId === ambassadorFilter;
      const matchesRoute = routeFilter === "all" || route === routeFilter.toLowerCase();
      const matchesDate = !dateFilter || date === dateFilter;
      const matchesStatus = statusFilter === "all" || bookingStatus === statusFilter;
      return matchesSearch && matchesAmbassador && matchesRoute && matchesDate && matchesStatus;
    });
  }, [rows, search, ambassadorFilter, routeFilter, dateFilter, statusFilter]);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#0f3f78]">Referral bookings</p>
            <h1 className="text-2xl font-black text-slate-900">All bookings generated through referral codes</h1>
          </div>
          <div className="flex gap-2">
            <Link href="/admin" className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Back to admin</Link>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search student name or phone" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            <select value={ambassadorFilter} onChange={(e) => setAmbassadorFilter(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <option value="all">All ambassadors</option>
              {ambassadors.map((ambassador) => (
                <option key={String(ambassador.id)} value={String(ambassador.id)}>{String(ambassador.full_name || ambassador.name || "—")}</option>
              ))}
            </select>
            <select value={routeFilter} onChange={(e) => setRouteFilter(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <option value="all">All routes</option>
              {[...new Set(rows.map((row) => String(row.route || "")))].filter(Boolean).map((route) => (
                <option key={route} value={route}>{route}</option>
              ))}
            </select>
            <input value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} type="date" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="paid">Paid</option>
            </select>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {loading ? (
            <p className="text-sm text-slate-500">Loading referral bookings…</p>
          ) : filteredRows.length === 0 ? (
            <p className="text-sm text-slate-500">No referral bookings found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-3">Booking ID</th>
                    <th className="px-3 py-3">Student</th>
                    <th className="px-3 py-3">Phone</th>
                    <th className="px-3 py-3">Route</th>
                    <th className="px-3 py-3">Date</th>
                    <th className="px-3 py-3">Referral code</th>
                    <th className="px-3 py-3">Ambassador</th>
                    <th className="px-3 py-3">Commission</th>
                    <th className="px-3 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={String(row.id)} className="border-b border-slate-100 last:border-b-0">
                      <td className="px-3 py-3 font-semibold text-slate-900">{String(row.booking_id || "—")}</td>
                      <td className="px-3 py-3 text-slate-900">{String(row.customer_name || "—")}</td>
                      <td className="px-3 py-3 text-slate-600">{String(row.customer_phone || "—")}</td>
                      <td className="px-3 py-3 text-slate-600">{String(row.route || "—")}</td>
                      <td className="px-3 py-3 text-slate-600">{String(row.travel_date || row.created_at || "—")}</td>
                      <td className="px-3 py-3 text-slate-600">{String((row as Record<string, unknown>).referral_code || "—")}</td>
                      <td className="px-3 py-3 text-slate-600">{String((row as Record<string, unknown>).ambassador_name || "—")}</td>
                      <td className="px-3 py-3 text-slate-900">MWK {Number(row.commission_amount || 0).toLocaleString()}</td>
                      <td className="px-3 py-3 text-slate-600">{String(row.commission_status || row.status || "pending")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
