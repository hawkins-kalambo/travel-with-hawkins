"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { authFetch, supabase } from "@/lib/auth";

export default function AmbassadorCustomersPage() {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await authFetch("/api/referrals", { method: "GET" });
        if (!res.ok) return;
        const data = await res.json();
        setRows(Array.isArray(data?.referrals) ? data.referrals : []);
      } catch (error) {
        console.error("Failed to load ambassador customers", error);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#0f3f78]">My customers</p>
            <h1 className="text-2xl font-black text-slate-900">Customers linked to your referral code</h1>
          </div>
          <div className="flex gap-2">
            <Link href="/ambassador/dashboard" className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Back to dashboard</Link>
            <button onClick={() => void supabase.auth.signOut()} className="rounded-lg bg-[#0f3f78] px-4 py-2 text-sm font-semibold text-white">Logout</button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {loading ? (
            <p className="text-sm text-slate-500">Loading your customers…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-slate-500">No customers linked to your referral code yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-3">Student</th>
                    <th className="px-3 py-3">Phone</th>
                    <th className="px-3 py-3">Route</th>
                    <th className="px-3 py-3">Travel date</th>
                    <th className="px-3 py-3">Booking status</th>
                    <th className="px-3 py-3">Commission</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={String(row.id)} className="border-b border-slate-100 last:border-b-0">
                      <td className="px-3 py-3 font-semibold text-slate-900">{String(row.customer_name || "—")}</td>
                      <td className="px-3 py-3 text-slate-600">{String(row.customer_phone || "—")}</td>
                      <td className="px-3 py-3 text-slate-600">{String(row.route || "—")}</td>
                      <td className="px-3 py-3 text-slate-600">{String(row.travel_date || "—")}</td>
                      <td className="px-3 py-3 text-slate-600">{String(row.commission_status || row.status || "pending")}</td>
                      <td className="px-3 py-3 text-slate-900">MWK {Number(row.commission_amount || 0).toLocaleString()}</td>
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
