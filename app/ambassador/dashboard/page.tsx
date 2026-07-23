"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { authFetch, supabase } from "@/lib/auth";

export default function AmbassadorDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [referrals, setReferrals] = useState<Array<Record<string, unknown>>>([]);
  const [stats, setStats] = useState({ totalReferrals: 0, confirmedBookings: 0, cancelledBookings: 0, totalEarnings: 0, pendingCommissions: 0, paidCommissions: 0, upcomingTrips: 0 });

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const [profileRes, referralsRes] = await Promise.all([
          authFetch("/api/profile", { method: "GET" }),
          authFetch("/api/referrals", { method: "GET" }),
        ]);

        if (profileRes.ok) {
          const profileData = await profileRes.json();
          setProfile(profileData?.profile || null);
        }

        if (referralsRes.ok) {
          const referralsData = await referralsRes.json();
          const rows = Array.isArray(referralsData?.referrals) ? referralsData.referrals : [];
          setReferrals(rows);
          setStats({
            totalReferrals: rows.length,
            confirmedBookings: rows.filter((row: Record<string, unknown>) => String(row.commission_status || "").toLowerCase() === "approved").length,
            cancelledBookings: rows.filter((row: Record<string, unknown>) => String(row.commission_status || "").toLowerCase() === "cancelled").length,
            totalEarnings: rows.reduce((sum: number, row: Record<string, unknown>) => sum + Number(row.commission_amount || 0), 0),
            pendingCommissions: rows.filter((row: Record<string, unknown>) => String(row.commission_status || "").toLowerCase() === "pending").reduce((sum: number, row: Record<string, unknown>) => sum + Number(row.commission_amount || 0), 0),
            paidCommissions: rows.filter((row: Record<string, unknown>) => String(row.commission_status || "").toLowerCase() === "paid").reduce((sum: number, row: Record<string, unknown>) => sum + Number(row.commission_amount || 0), 0),
            upcomingTrips: rows.filter((row: Record<string, unknown>) => String(row.travel_date || "").trim()).length,
          });
        }
      } catch (error) {
        console.error("Failed to load ambassador dashboard", error);
      } finally {
        setLoading(false);
      }
    };

    void loadDashboard();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-50 p-6 text-sm text-slate-500">Loading ambassador dashboard…</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#0f3f78]">Ambassador Portal</p>
            <h1 className="text-2xl font-black text-slate-900">Welcome, {String(profile?.full_name || profile?.email || "Ambassador")}</h1>
            <p className="mt-1 text-sm text-slate-500">Track your customers, commissions, and passenger manifests in one place.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/" className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Home</Link>
            <button onClick={() => void handleLogout()} className="rounded-lg bg-[#0f3f78] px-4 py-2 text-sm font-semibold text-white">Logout</button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          {[
            ["Total referrals", stats.totalReferrals],
            ["Confirmed bookings", stats.confirmedBookings],
            ["Cancelled bookings", stats.cancelledBookings],
            ["Total earnings", `MWK ${stats.totalEarnings.toLocaleString()}`],
            ["Pending commissions", `MWK ${stats.pendingCommissions.toLocaleString()}`],
            ["Paid commissions", `MWK ${stats.paidCommissions.toLocaleString()}`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
              <p className="mt-2 text-xl font-black text-slate-900">{value}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-slate-900">My Customers</h2>
              <Link href="/ambassador/customers" className="text-sm font-semibold text-[#0f3f78]">Manage all</Link>
            </div>
            <div className="mt-4 space-y-3">
              {referrals.length === 0 ? (
                <p className="text-sm text-slate-500">No customers linked to your referrals yet.</p>
              ) : referrals.slice(0, 5).map((referral) => (
                <div key={String(referral.id)} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900">{String(referral.customer_name || "—")}</p>
                      <p className="text-sm text-slate-500">{String(referral.customer_phone || "—")}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-900">{String(referral.route || "—")}</p>
                      <p className="text-xs text-slate-500">{String(referral.travel_date || "—")}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-slate-900">Commission overview</h2>
              <Link href="/ambassador/commissions" className="text-sm font-semibold text-[#0f3f78]">View history</Link>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-sm text-slate-500">Total earned</p>
                <p className="text-xl font-black text-slate-900">MWK {stats.totalEarnings.toLocaleString()}</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-sm text-slate-500">Pending</p>
                <p className="text-xl font-black text-slate-900">MWK {stats.pendingCommissions.toLocaleString()}</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-sm text-slate-500">Paid</p>
                <p className="text-xl font-black text-slate-900">MWK {stats.paidCommissions.toLocaleString()}</p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">Passenger manifest</p>
              <p className="mt-1 text-sm text-slate-500">Prepare upcoming trips and share passenger lists with operations.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">Print manifest</button>
                <button className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">Download PDF</button>
                <button className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">Share</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
