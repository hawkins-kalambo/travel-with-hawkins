"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { authFetch } from "@/lib/auth";

type AmbassadorDetails = {
  id: string;
  profile_id?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp_number?: string | null;
  university?: string | null;
  faculty?: string | null;
  program?: string | null;
  year_of_study?: number | null;
  referral_code?: string | null;
  status?: string | null;
  created_at?: string | null;
  last_login?: string | null;
  is_verified?: boolean | null;
  suspension_reason?: string | null;
  profile_image_url?: string | null;
  student_id?: string | null;
};

type StatsPayload = {
  totalReferrals: number;
  totalApplicationsReferred: number;
  successfulBookings: number;
  conversionRate: number;
  totalCommission: number;
  pendingCommission: number;
  approvedCommission: number;
  paidCommission: number;
  bookings: Array<Record<string, unknown>>;
  activity: Array<Record<string, unknown>>;
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatCurrency(value: number) {
  return `MWK ${value.toLocaleString()}`;
}

export default function AdminAmbassadorProfilePage() {
  const params = useParams<{ id: string }>();
  const [ambassador, setAmbassador] = useState<AmbassadorDetails | null>(null);
  const [stats, setStats] = useState<StatsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({ phone: "", email: "", university: "", program: "", faculty: "", whatsapp_number: "" });
  const [profileImageBase64, setProfileImageBase64] = useState<string | null>(null);

  const loadDetails = async () => {
    try {
      const res = await authFetch(`/api/ambassadors/${params.id}`, { method: "GET" });
      if (!res.ok) throw new Error("Unable to load ambassador profile");
      const data = (await res.json()) as { ambassador?: AmbassadorDetails; stats?: StatsPayload };
      setAmbassador(data.ambassador || null);
      setStats(data.stats || null);
      setForm({
        phone: data.ambassador?.phone || "",
        email: data.ambassador?.email || "",
        university: data.ambassador?.university || "",
        program: data.ambassador?.program || "",
        faculty: data.ambassador?.faculty || "",
        whatsapp_number: data.ambassador?.whatsapp_number || "",
      });
    } catch (error) {
      console.error("Failed to load ambassador details", error);
      setMessage(error instanceof Error ? error.message : "Unable to load ambassador profile");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDetails();
  }, [params.id]);

  const resetPassword = async (mode: "send-reset" | "temporary-password") => {
    if (!ambassador?.email) return;

    const confirmed = window.confirm(
      mode === "send-reset"
        ? `Send a password reset email to ${ambassador.full_name || ambassador.email}?`
        : `Generate a temporary password for ${ambassador.full_name || ambassador.email}?`
    );

    if (!confirmed) return;

    try {
      const res = await authFetch("/api/ambassadors/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: ambassador.email, mode }),
      });
      const body = (await res.json()) as { success?: boolean; error?: string; message?: string; temporaryPassword?: string };
      if (!res.ok || body.success !== true) throw new Error(body.error || "Unable to reset password");
      setMessage(body.message || (body.temporaryPassword ? `Temporary password created: ${body.temporaryPassword}` : "Password reset request sent."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Password reset failed");
    }
  };

  const updateStatus = async (nextStatus: string) => {
    if (!ambassador?.id) return;
    setStatusUpdating(true);
    try {
      const res = await authFetch(`/api/ambassadors/${ambassador.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus, suspension_reason: nextStatus === "suspended" ? "Suspended by administrative action" : null }),
      });
      const body = (await res.json()) as { success?: boolean; error?: string; ambassador?: AmbassadorDetails };
      if (!res.ok || body.success !== true) throw new Error(body.error || "Unable to update ambassador status");
      setAmbassador(body.ambassador || ambassador);
      setMessage(`Status changed to ${nextStatus}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update ambassador status");
    } finally {
      setStatusUpdating(false);
    }
  };

  const saveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ambassador?.id) return;
    setSavingProfile(true);
    try {
      const res = await authFetch(`/api/ambassadors/${ambassador.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: form.phone,
          email: form.email,
          university: form.university,
          program: form.program,
          faculty: form.faculty,
          whatsapp_number: form.whatsapp_number,
          profileImageBase64: profileImageBase64 || undefined,
        }),
      });

      const body = (await res.json()) as { success?: boolean; error?: string; ambassador?: AmbassadorDetails };
      if (!res.ok || body.success !== true) throw new Error(body.error || "Unable to save profile changes");
      setAmbassador(body.ambassador || ambassador);
      setMessage("Profile changes saved.");
      setProfileImageBase64(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save profile changes");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleImageSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setProfileImageBase64(reader.result);
        setMessage("Profile image ready to upload.");
      }
    };
    reader.readAsDataURL(file);
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-50 p-6 text-sm text-slate-500">Loading ambassador details…</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#0f3f78]">Ambassador profile</p>
              <h1 className="mt-2 text-3xl font-black text-slate-900">{ambassador?.full_name || "Ambassador"}</h1>
            </div>
            <Link href="/admin/ambassadors" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Back to list
            </Link>
          </div>

          {message && (
            <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-900">{message}</div>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.3fr_0.9fr]">
          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-start">
                <div className="h-28 w-28 overflow-hidden rounded-full bg-slate-100">
                  {ambassador?.profile_image_url ? (
                    <img src={ambassador.profile_image_url} alt={ambassador.full_name || "Profile"} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-lg font-bold text-slate-500">TH</div>
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{ambassador?.is_verified ? "✓ Verified Campus Ambassador" : "Unverified ambassador"}</span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{ambassador?.status || "active"}</span>
                  </div>
                  <div className="mt-3 text-sm text-slate-500">
                    <p className="text-lg font-bold text-slate-900">{ambassador?.referral_code || "—"}</p>
                    <p className="mt-1">{ambassador?.university || "—"} • {ambassador?.program || "—"}</p>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button onClick={() => void resetPassword("send-reset")} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Reset password</button>
                    <button onClick={() => void resetPassword("temporary-password")} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Generate temporary password</button>
                    <button onClick={() => void updateStatus("suspended")} disabled={statusUpdating} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700">Suspend account</button>
                    <button onClick={() => void updateStatus("active")} disabled={statusUpdating} className="rounded-lg bg-[#0f3f78] px-3 py-2 text-sm font-semibold text-white hover:bg-[#0a2d56]">Reactivate</button>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-black text-slate-900">Personal information</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Full name</p><p className="mt-1 text-sm font-semibold text-slate-900">{ambassador?.full_name || "—"}</p></div>
                <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Student ID</p><p className="mt-1 text-sm text-slate-700">{ambassador?.student_id || "—"}</p></div>
                <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Email</p><p className="mt-1 text-sm text-slate-700">{ambassador?.email || "—"}</p></div>
                <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Phone</p><p className="mt-1 text-sm text-slate-700">{ambassador?.phone || "—"}</p></div>
                <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">WhatsApp</p><p className="mt-1 text-sm text-slate-700">{ambassador?.whatsapp_number || "—"}</p></div>
                <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">University</p><p className="mt-1 text-sm text-slate-700">{ambassador?.university || "—"}</p></div>
                <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Faculty</p><p className="mt-1 text-sm text-slate-700">{ambassador?.faculty || "—"}</p></div>
                <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Programme</p><p className="mt-1 text-sm text-slate-700">{ambassador?.program || "—"}</p></div>
                <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Year of study</p><p className="mt-1 text-sm text-slate-700">{ambassador?.year_of_study || "—"}</p></div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-black text-slate-900">Referral performance</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {[
                  ["Total referral clicks", stats?.totalReferrals ?? 0],
                  ["Total applications referred", stats?.totalApplicationsReferred ?? 0],
                  ["Successful bookings", stats?.successfulBookings ?? 0],
                  ["Conversion rate", `${stats?.conversionRate ?? 0}%`],
                  ["Commission earned", formatCurrency(stats?.totalCommission ?? 0)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
                    <p className="mt-2 text-xl font-black text-slate-900">{value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-black text-slate-900">Booking history</h2>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-3 text-left font-semibold text-slate-700">Booking ID</th>
                      <th className="px-3 py-3 text-left font-semibold text-slate-700">Customer</th>
                      <th className="px-3 py-3 text-left font-semibold text-slate-700">Route</th>
                      <th className="px-3 py-3 text-left font-semibold text-slate-700">Date</th>
                      <th className="px-3 py-3 text-left font-semibold text-slate-700">Amount</th>
                      <th className="px-3 py-3 text-left font-semibold text-slate-700">Commission</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(stats?.bookings || []).length === 0 ? (
                      <tr><td className="px-3 py-4 text-slate-500" colSpan={6}>No bookings available yet.</td></tr>
                    ) : (stats?.bookings || []).map((booking) => (
                      <tr key={String(booking.id)}>
                        <td className="px-3 py-3 text-slate-700">{String(booking.id || "—")}</td>
                        <td className="px-3 py-3 text-slate-700">{String(booking.customer_name || booking.customer || "—")}</td>
                        <td className="px-3 py-3 text-slate-700">{String(booking.route || "—")}</td>
                        <td className="px-3 py-3 text-slate-700">{formatDate(String(booking.created_at || booking.travel_date || ""))}</td>
                        <td className="px-3 py-3 text-slate-700">{formatCurrency(Number(booking.amount || booking.fare || 0))}</td>
                        <td className="px-3 py-3 text-slate-700">{formatCurrency(Number(booking.commission_amount || 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-black text-slate-900">Activity timeline</h2>
              <div className="mt-4 space-y-3">
                {(stats?.activity || []).length === 0 ? (
                  <p className="text-sm text-slate-500">No recent activity yet.</p>
                ) : (stats?.activity || []).map((item, index) => (
                  <div key={String(item.id || index)} className="rounded-2xl border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{String(item.activity_type || "Activity")}</p>
                        <p className="text-sm text-slate-500">{String(item.description || "—")}</p>
                      </div>
                      <span className="text-xs text-slate-500">{formatDate(String(item.created_at || ""))}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-black text-slate-900">Account information</h2>
              <div className="mt-4 space-y-3 text-sm">
                <div className="rounded-2xl border border-slate-200 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Account created</p>
                  <p className="mt-1 font-semibold text-slate-900">{formatDate(ambassador?.created_at)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Last login</p>
                  <p className="mt-1 font-semibold text-slate-900">{formatDate(ambassador?.last_login)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Status</p>
                  <p className="mt-1 font-semibold text-slate-900">{ambassador?.status || "active"}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Authentication status</p>
                  <p className="mt-1 font-semibold text-slate-900">{ambassador?.is_verified ? "Verified via Supabase Auth" : "Pending verification"}</p>
                </div>
              </div>
            </div>

            <form onSubmit={saveProfile} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-black text-slate-900">Edit profile</h2>
              <div className="mt-4 grid gap-3">
                <input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Phone" className="input-field" />
                <input value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="Email" className="input-field" />
                <input value={form.whatsapp_number} onChange={(event) => setForm((current) => ({ ...current, whatsapp_number: event.target.value }))} placeholder="WhatsApp number" className="input-field" />
                <label className="rounded-2xl border border-dashed border-slate-300 p-3 text-sm text-slate-600">
                  <span className="mb-2 block font-semibold text-slate-700">Upload profile photo</span>
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleImageSelection} className="block w-full text-sm" />
                </label>
                {profileImageBase64 && <p className="text-sm text-emerald-700">New photo selected and will be uploaded on save.</p>}
                <input value={form.university} onChange={(event) => setForm((current) => ({ ...current, university: event.target.value }))} placeholder="University" className="input-field" />
                <input value={form.faculty} onChange={(event) => setForm((current) => ({ ...current, faculty: event.target.value }))} placeholder="Faculty" className="input-field" />
                <input value={form.program} onChange={(event) => setForm((current) => ({ ...current, program: event.target.value }))} placeholder="Programme" className="input-field" />
                <button type="submit" disabled={savingProfile} className="rounded-xl bg-[#0f3f78] px-4 py-3 text-sm font-semibold text-white hover:bg-[#0a2d56] disabled:opacity-50">
                  {savingProfile ? "Saving..." : "Save profile changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
