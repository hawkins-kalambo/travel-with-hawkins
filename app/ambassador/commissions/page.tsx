"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { authFetch, supabase } from "@/lib/auth";

export default function AmbassadorCommissionsPage() {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadCommissions = async () => {
      try {
        const res = await authFetch("/api/referrals", { method: "GET" });
        if (!res.ok) return;
        const data = await res.json();
        setRows(Array.isArray(data?.referrals) ? data.referrals : []);
      } catch (error) {
        console.error("Failed to load commissions", error);
      } finally {
        setLoading(false);
      }
    };

    void loadCommissions();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#0f3f78]">Commission Dashboard</p>
            <h1 className="text-2xl font-black text-slate-900">Your commission activity</h1>
          </div>
          <div className="flex gap-2">
            <Link href="/ambassador/dashboard" className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Back to dashboard</Link>
            <button onClick={() => void supabase.auth.signOut()} className="rounded-lg bg-[#0f3f78] px-4 py-2 text-sm font-semibold text-white">Logout</button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {loading ? (
            <p className="text-sm text-slate-500">Loading commissions…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-slate-500">No commission data yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-3">Booking</th>
                    <th className="px-3 py-3">Date</th>
                    <th className="px-3 py-3">Route</th>
                    <th className="px-3 py-3">Commission</th>
                    <th className="px-3 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={String(row.id)} className="border-b border-slate-100 last:border-b-0">
                      <td className="px-3 py-3 font-semibold text-slate-900">{String(row.customer_name || "—")}</td>
                      <td className="px-3 py-3 text-slate-600">{String(row.created_at || "—")}</td>
                      <td className="px-3 py-3 text-slate-600">{String((row as Record<string, unknown>).route || "—")}</td>
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
