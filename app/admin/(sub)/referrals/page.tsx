"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { authFetch } from "@/lib/auth";
import AmbassadorCreationSuccess from "@/app/admin/components/AmbassadorCreationSuccess";
import AmbassadorCreationWizard from "@/app/admin/components/AmbassadorCreationWizard";
import PageHeader from "@/app/components/ui/PageHeader";
import { LoadingState } from "@/app/components/ui/Spinner";

type AmbassadorCreationPayload = {
  fullName: string;
  studentId?: string;
  email: string;
  phone: string;
  whatsappNumber?: string;
  faculty?: string;
  program?: string;
  yearOfStudy?: string;
  profileImageBase64?: string;
  referralCode?: string;
  routeAssignment?: string;
  universityId?: string;
  university?: string;
  status?: string;
  temporaryPassword: string;
};

type CreatedAmbassadorCredentials = {
  fullName: string;
  email: string;
  referralCode: string;
  temporaryPassword?: string;
};

export default function AdminReferralsPage() {
  const [loading, setLoading] = useState(true);
  const [ambassadors, setAmbassadors] = useState<Array<Record<string, unknown>>>([]);
  const [referrals, setReferrals] = useState<Array<Record<string, unknown>>>([]);
  const [ambassadorMessage, setAmbassadorMessage] = useState("");
  const [createdAmbassadorCredentials, setCreatedAmbassadorCredentials] = useState<CreatedAmbassadorCredentials | null>(null);
  const [referralFilters, setReferralFilters] = useState({ ambassador: "all", route: "all", status: "all", date: "" });
  const [togglingAmbassador, setTogglingAmbassador] = useState<string | null>(null);
  const [updatingCommission, setUpdatingCommission] = useState<string | null>(null);
  const [expandedAmbassadorId, setExpandedAmbassadorId] = useState<string | null>(null);
  const [deletingReferral, setDeletingReferral] = useState<string | null>(null);

  const loadReferralsData = useCallback(async () => {
    try {
      const [ambassadorsRes, referralsRes] = await Promise.all([
        authFetch("/api/ambassadors", { method: "GET" }),
        authFetch("/api/referrals", { method: "GET" }),
      ]);

      if (ambassadorsRes.status === 401 || referralsRes.status === 401) {
        console.warn("Skipping admin data load because the session is not yet authorized.");
        return;
      }

      if (ambassadorsRes.ok) {
        const ambassadorsData = await ambassadorsRes.json();
        setAmbassadors(Array.isArray(ambassadorsData?.ambassadors) ? ambassadorsData.ambassadors : []);
      }

      if (referralsRes.ok) {
        const referralsData = await referralsRes.json();
        const rows = Array.isArray(referralsData?.referrals) ? referralsData.referrals : [];
        setReferrals(rows);
      }
    } catch (error) {
      console.error("Failed to load referral data", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadReferralsData();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadReferralsData]);

  const referralOverview = useMemo(() => {
    const ambassadorRows = Array.isArray(ambassadors) ? ambassadors : [];
    const referralRows = Array.isArray(referrals) ? referrals : [];

    const totalAmbassadors = ambassadorRows.length;
    const activeAmbassadors = ambassadorRows.filter((item) => String(item.status || "active").toLowerCase() === "active").length;
    const totalReferralCustomers = referralRows.length;
    const totalReferralRevenue = referralRows.reduce((sum, row) => sum + Number(row.commission_amount || 0), 0);
    const totalCommissionGenerated = referralRows.reduce((sum, row) => sum + Number(row.commission_amount || 0), 0);
    const pendingCommission = referralRows
      .filter((row) => String(row.commission_status || row.status || "").toLowerCase() === "pending")
      .reduce((sum, row) => sum + Number(row.commission_amount || 0), 0);
    const paidCommission = referralRows
      .filter((row) => String(row.commission_status || row.status || "").toLowerCase() === "paid")
      .reduce((sum, row) => sum + Number(row.commission_amount || 0), 0);

    const performance = ambassadorRows
      .map((ambassador) => {
        const ambassadorId = String(ambassador.id || "");
        const ambassadorReferrals = referralRows.filter((row) => String(row.ambassador_id) === ambassadorId);
        const revenue = ambassadorReferrals.reduce((sum, row) => sum + Number(row.commission_amount || 0), 0);
        const commission = revenue;
        return {
          id: ambassadorId,
          name: String(ambassador.full_name || ambassador.name || "—"),
          referralCode: String(ambassador.referral_code || "—"),
          faculty: String(ambassador.faculty || ambassador.university || "—"),
          status: String(ambassador.status || "active"),
          customers: ambassadorReferrals.length,
          bookings: ambassadorReferrals.length,
          revenue,
          commission,
          rows: ambassadorReferrals,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);

    const facultyBreakdown = performance.reduce<Record<string, { label: string; customers: number }>>((acc, item) => {
      const key = item.faculty || "Unspecified";
      if (!acc[key]) acc[key] = { label: key, customers: 0 };
      acc[key].customers += item.customers;
      return acc;
    }, {});

    return {
      totalAmbassadors,
      activeAmbassadors,
      totalReferralCustomers,
      totalReferralRevenue,
      totalCommissionGenerated,
      pendingCommission,
      paidCommission,
      performance,
      facultyBreakdown: Object.values(facultyBreakdown).sort((a, b) => b.customers - a.customers),
    };
  }, [ambassadors, referrals]);

  const createAmbassador = async (payload: AmbassadorCreationPayload) => {
    setAmbassadorMessage("");
    try {
      const res = await authFetch("/api/ambassadors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: payload.fullName,
          phone: payload.phone,
          email: payload.email,
          universityId: payload.universityId,
          university: payload.university,
          faculty: payload.faculty || "",
          program: payload.program || "",
          yearOfStudy: payload.yearOfStudy ? Number(payload.yearOfStudy) : undefined,
          referralCode: payload.referralCode,
          studentId: payload.studentId,
          whatsappNumber: payload.whatsappNumber,
          status: payload.status,
          temporaryPassword: payload.temporaryPassword,
        }),
      });

      const result = await res.json();
      if (!res.ok || !result?.success) {
        throw new Error(result?.error || "Unable to create ambassador");
      }

      const credentials = result.credentials || {};
      setAmbassadorMessage("Ambassador created successfully.");
      setCreatedAmbassadorCredentials({
        fullName: String(credentials.fullName ?? payload.fullName),
        email: String(credentials.email ?? payload.email),
        referralCode: String(credentials.referralCode ?? payload.referralCode ?? ""),
        temporaryPassword: credentials.temporaryPassword ? String(credentials.temporaryPassword) : undefined,
      });
      await loadReferralsData();
    } catch (error) {
      setAmbassadorMessage(error instanceof Error ? error.message : "Unable to create ambassador.");
      setCreatedAmbassadorCredentials(null);
    }
  };

  const toggleAmbassadorStatus = async (ambassadorId: string, nextStatus: string) => {
    setTogglingAmbassador(ambassadorId);
    try {
      const res = await authFetch("/api/ambassadors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ambassadorId, status: nextStatus }),
      });
      const result = await res.json();
      if (!res.ok || !result?.success) {
        throw new Error(result?.error || "Unable to update ambassador status");
      }
      await loadReferralsData();
      setAmbassadorMessage(`Ambassador marked ${nextStatus}.`);
    } catch (error) {
      setAmbassadorMessage(error instanceof Error ? error.message : "Unable to update ambassador status.");
    } finally {
      setTogglingAmbassador(null);
    }
  };

  const updateCommissionStatus = async (referralId: string, commissionStatus: string) => {
    setUpdatingCommission(referralId);
    try {
      const res = await authFetch("/api/commissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referralId, commissionStatus }),
      });
      const result = await res.json();
      if (!res.ok || !result?.success) {
        throw new Error(result?.error || "Unable to update commission status");
      }
      await loadReferralsData();
      setAmbassadorMessage(`Commission marked ${commissionStatus}.`);
    } catch (error) {
      setAmbassadorMessage(error instanceof Error ? error.message : "Unable to update commission status.");
    } finally {
      setUpdatingCommission(null);
    }
  };

  const deleteReferral = async (referralId: string) => {
    if (!confirm("Are you sure you want to delete this referral entry? This action cannot be undone.")) {
      return;
    }
    setDeletingReferral(referralId);
    try {
      const res = await authFetch("/api/referrals", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referralId }),
      });
      const result = await res.json();
      if (!res.ok || !result?.success) {
        throw new Error(result?.error || "Unable to delete referral");
      }
      await loadReferralsData();
      setAmbassadorMessage("Referral entry deleted successfully.");
    } catch (error) {
      setAmbassadorMessage(error instanceof Error ? error.message : "Unable to delete referral.");
    } finally {
      setDeletingReferral(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Referrals" title="Referral Management" description="Create ambassadors, manage their status, and track referral performance from one place." />

      {loading ? (
        <LoadingState label="Loading referrals…" />
      ) : (
        <div className="space-y-6">
          <div className="bg-white border border-[#d7ebff] rounded-xl shadow-sm p-6">
            {ambassadorMessage && <div className="mb-4 rounded-lg border border-primary-200 bg-primary-100 p-3 text-sm text-primary-700">{ambassadorMessage}</div>}
            <div>
              {createdAmbassadorCredentials ? (
                <AmbassadorCreationSuccess
                  ambassadorName={createdAmbassadorCredentials.fullName}
                  email={createdAmbassadorCredentials.email}
                  temporaryPassword={createdAmbassadorCredentials.temporaryPassword}
                  referralCode={createdAmbassadorCredentials.referralCode}
                  referralLink={`${typeof window !== "undefined" ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL ?? "https://travelwithhawkins.com")}/book?ref=${encodeURIComponent(createdAmbassadorCredentials.referralCode)}`}
                  loginUrl={typeof window !== "undefined" ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL ?? "https://travelwithhawkins.com")}
                  onClose={() => setCreatedAmbassadorCredentials(null)}
                  onResendEmail={async () => {
                    if (!createdAmbassadorCredentials) return;
                    const res = await authFetch("/api/ambassadors/resend", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ email: createdAmbassadorCredentials.email }),
                    });
                    const result = await res.json();
                    if (!res.ok || !result?.success) {
                      throw new Error(result?.error || "Unable to resend welcome email");
                    }
                  }}
                  onGenerateNewPassword={async () => {
                    if (!createdAmbassadorCredentials) throw new Error("Missing ambassador email");
                    const res = await authFetch("/api/ambassadors/password", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ email: createdAmbassadorCredentials.email, mode: "temporary-password" }),
                    });
                    const result = await res.json();
                    if (!res.ok || !result?.success) {
                      throw new Error(result?.error || "Unable to generate temporary password");
                    }
                    return String(result.temporaryPassword);
                  }}
                />
              ) : (
                <AmbassadorCreationWizard onSubmit={createAmbassador} />
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Total ambassadors</p>
              <p className="mt-2 text-2xl font-black text-slate-900">{referralOverview.totalAmbassadors}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Active ambassadors</p>
              <p className="mt-2 text-2xl font-black text-slate-900">{referralOverview.activeAmbassadors}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Referral customers</p>
              <p className="mt-2 text-2xl font-black text-slate-900">{referralOverview.totalReferralCustomers}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Pending commission</p>
              <p className="mt-2 text-2xl font-black text-slate-900">MWK {referralOverview.pendingCommission.toLocaleString()}</p>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-primary-900">Referral Overview</h4>
                <span className="text-xs text-slate-500">Partner performance</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Referral revenue</p>
                  <p className="mt-1 text-xl font-black text-slate-900">MWK {referralOverview.totalReferralRevenue.toLocaleString()}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Commission generated</p>
                  <p className="mt-1 text-xl font-black text-slate-900">MWK {referralOverview.totalCommissionGenerated.toLocaleString()}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Paid commission</p>
                  <p className="mt-1 text-xl font-black text-slate-900">MWK {referralOverview.paidCommission.toLocaleString()}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Booked referrals</p>
                  <p className="mt-1 text-xl font-black text-slate-900">{referralOverview.totalReferralCustomers}</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h4 className="font-bold text-primary-900">Top ambassadors</h4>
              <div className="mt-4 space-y-2">
                {referralOverview.performance.slice(0, 5).map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                      <p className="text-xs text-slate-500">{item.referralCode}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-primary-900">{item.bookings} bookings</p>
                      <p className="text-xs text-slate-500">MWK {item.revenue.toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <div className="bg-white border border-[#d7ebff] rounded-xl shadow-sm p-6">
              <h4 className="font-bold text-primary-900">Ambassadors</h4>
              <div className="mt-4 space-y-3">
                {ambassadors.length === 0 ? (
                  <p className="text-sm text-slate-500">No ambassadors yet.</p>
                ) : (
                  ambassadors.map((ambassador) => {
                    const ambassadorId = String(ambassador.id || "");
                    const performanceItem = referralOverview.performance.find((item) => item.id === ambassadorId);
                    const isExpanded = expandedAmbassadorId === ambassadorId;
                    return (
                      <div key={ambassadorId} className="rounded-lg border border-slate-200 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-slate-900">{String(ambassador.full_name || ambassador.name || "—")}</p>
                            <p className="text-xs text-slate-500">Code: {String(ambassador.referral_code || "—")}</p>
                            <p className="mt-1 text-xs text-slate-500">{String(ambassador.email || "—")}</p>
                          </div>
                          <div className="text-right">
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${String(ambassador.status || "active").toLowerCase() === "active" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
                            >
                              {String(ambassador.status || "active")}
                            </span>
                            <div className="mt-2 flex gap-2">
                              <button onClick={() => setExpandedAmbassadorId(isExpanded ? null : ambassadorId)} className="rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700">
                                {isExpanded ? "Hide details" : "View details"}
                              </button>
                              <button
                                onClick={() => void toggleAmbassadorStatus(ambassadorId, String(ambassador.status || "active").toLowerCase() === "active" ? "inactive" : "active")}
                                disabled={togglingAmbassador === ambassadorId}
                                className="rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 disabled:opacity-50"
                              >
                                {togglingAmbassador === ambassadorId ? "Updating..." : String(ambassador.status || "active").toLowerCase() === "active" ? "Deactivate" : "Activate"}
                              </button>
                            </div>
                          </div>
                        </div>
                        {isExpanded && performanceItem && (
                          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Ambassador profile</p>
                            <div className="mt-2 grid gap-3 md:grid-cols-2">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">{String(ambassador.full_name || ambassador.name || "—")}</p>
                                <p className="text-xs text-slate-500">Phone: {String(ambassador.phone || "—")}</p>
                                <p className="text-xs text-slate-500">Faculty: {String(ambassador.faculty || "—")}</p>
                                <p className="text-xs text-slate-500">University: {String(ambassador.university || "—")}</p>
                              </div>
                              <div className="rounded-lg border border-slate-200 bg-white p-3">
                                <p className="text-xs text-slate-500">Students referred</p>
                                <p className="text-lg font-black text-slate-900">{performanceItem.customers}</p>
                                <p className="mt-1 text-xs text-slate-500">Bookings: {performanceItem.bookings}</p>
                                <p className="text-xs text-slate-500">Revenue: MWK {performanceItem.revenue.toLocaleString()}</p>
                                <p className="text-xs text-slate-500">Commission: MWK {performanceItem.commission.toLocaleString()}</p>
                              </div>
                            </div>
                            <div className="mt-3">
                              <p className="text-sm font-semibold text-slate-900">These are the students brought by this ambassador.</p>
                              <div className="mt-2 space-y-2">
                                {performanceItem.rows.length === 0 ? (
                                  <p className="text-sm text-slate-500">No referral customers yet.</p>
                                ) : (
                                  performanceItem.rows.map((row) => (
                                    <div key={String(row.id)} className="flex items-center justify-between rounded border border-slate-200 bg-white px-3 py-2 text-sm">
                                      <div>
                                        <p className="font-semibold text-slate-900">{String(row.customer_name || "—")}</p>
                                        <p className="text-xs text-slate-500">
                                          {String(row.route || "—")} • {String(row.travel_date || "—")}
                                        </p>
                                      </div>
                                      <div className="text-right">
                                        <p className="font-semibold text-primary-900">MWK {Number(row.commission_amount || 0).toLocaleString()}</p>
                                        <p className="text-xs text-slate-500">{String(row.commission_status || row.status || "pending")}</p>
                                      </div>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="bg-white border border-[#d7ebff] rounded-xl shadow-sm p-6">
              <h4 className="font-bold text-primary-900">Referral Bookings</h4>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <select value={referralFilters.ambassador} onChange={(e) => setReferralFilters({ ...referralFilters, ambassador: e.target.value })} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                  <option value="all">All ambassadors</option>
                  {ambassadors.map((ambassador) => (
                    <option key={String(ambassador.id)} value={String(ambassador.id)}>
                      {String(ambassador.full_name || ambassador.name || "—")}
                    </option>
                  ))}
                </select>
                <input value={referralFilters.date} onChange={(e) => setReferralFilters({ ...referralFilters, date: e.target.value })} type="date" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
                <select value={referralFilters.route} onChange={(e) => setReferralFilters({ ...referralFilters, route: e.target.value })} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                  <option value="all">All routes</option>
                  {[...new Set(referrals.map((row) => String((row as Record<string, unknown>).route || "")))]
                    .filter(Boolean)
                    .map((route) => (
                      <option key={route} value={route}>
                        {route}
                      </option>
                    ))}
                </select>
                <select value={referralFilters.status} onChange={(e) => setReferralFilters({ ...referralFilters, status: e.target.value })} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                  <option value="all">All statuses</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="paid">Paid</option>
                </select>
              </div>
              <div className="mt-4 space-y-3">
                {(() => {
                  const filteredRows = referrals.filter((referral) => {
                    const ambassadorOk = referralFilters.ambassador === "all" || String(referral.ambassador_id) === referralFilters.ambassador;
                    const routeOk = referralFilters.route === "all" || String((referral as Record<string, unknown>).route || "") === referralFilters.route;
                    const statusOk = referralFilters.status === "all" || String(referral.commission_status || referral.status || "").toLowerCase() === referralFilters.status;
                    const dateOk = !referralFilters.date || String(referral.created_at || "").slice(0, 10) === referralFilters.date;
                    return ambassadorOk && routeOk && statusOk && dateOk;
                  });

                  if (filteredRows.length === 0) {
                    return <p className="text-sm text-slate-500">No referral bookings match the selected filters.</p>;
                  }

                  return filteredRows.slice(0, 8).map((referral) => (
                    <div key={String(referral.id)} className="rounded-lg border border-slate-200 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-slate-900">{String(referral.customer_name || "—")}</p>
                          <p className="text-xs text-slate-500">
                            {String((referral as Record<string, unknown>).route || "—")} • {String(referral.created_at || "—")}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-primary-900">MWK {Number(referral.commission_amount || 0).toLocaleString()}</p>
                          <p className="text-xs text-slate-500">{String(referral.commission_status || referral.status || "pending")}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button onClick={() => void updateCommissionStatus(String(referral.id), "approved")} disabled={updatingCommission === String(referral.id)} className="rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 disabled:opacity-50">
                          {updatingCommission === String(referral.id) ? "Updating..." : "Approve"}
                        </button>
                        <button onClick={() => void updateCommissionStatus(String(referral.id), "paid")} disabled={updatingCommission === String(referral.id)} className="rounded border border-primary-200 bg-primary-50 px-2.5 py-1 text-[11px] font-semibold text-primary-700 disabled:opacity-50">
                          {updatingCommission === String(referral.id) ? "Updating..." : "Mark Paid"}
                        </button>
                        <button onClick={() => void deleteReferral(String(referral.id))} disabled={deletingReferral === String(referral.id)} className="rounded border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700 disabled:opacity-50">
                          {deletingReferral === String(referral.id) ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
