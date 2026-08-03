"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { authFetch } from "@/lib/auth";
import Card from "@/app/components/ui/Card";
import PageHeader from "@/app/components/ui/PageHeader";
import Button from "@/app/components/ui/Button";
import Badge from "@/app/components/ui/Badge";
import ConfirmDialog from "@/app/components/ui/ConfirmDialog";
import { LoadingState } from "@/app/components/ui/Spinner";
import { ambassadorStatusTone } from "@/lib/statusTones";

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
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [form, setForm] = useState({ phone: "", email: "", university: "", program: "", faculty: "", whatsapp_number: "" });
  const [profileImageBase64, setProfileImageBase64] = useState<string | null>(null);
  const [pendingPasswordAction, setPendingPasswordAction] = useState<"send-reset" | "temporary-password" | null>(null);
  const [pendingStatusAction, setPendingStatusAction] = useState<"suspended" | "active" | null>(null);
  const [verificationUpdating, setVerificationUpdating] = useState(false);
  const [pendingVerificationAction, setPendingVerificationAction] = useState<"verify" | "unverify" | null>(null);
  const [copiedReferral, setCopiedReferral] = useState<"code" | "link" | null>(null);

  const referralLink = useMemo(() => {
    const code = ambassador?.referral_code?.trim();
    if (!code) return "";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://travelwithhawkins.com";
    return `${appUrl.replace(/\/$/, "")}/book?ref=${encodeURIComponent(code)}`;
  }, [ambassador?.referral_code]);

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
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Unable to load ambassador profile" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDetails();
  }, [params.id]);

  const resetPassword = async (mode: "send-reset" | "temporary-password") => {
    if (!ambassador?.email) return;

    try {
      const res = await authFetch("/api/ambassadors/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: ambassador.email, mode }),
      });
      const body = (await res.json()) as { success?: boolean; error?: string; message?: string; temporaryPassword?: string };
      if (!res.ok || body.success !== true) throw new Error(body.error || "Unable to reset password");
      setMessage({
        type: "success",
        text: body.message || (body.temporaryPassword ? `Temporary password created: ${body.temporaryPassword}` : "Password reset request sent."),
      });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Password reset failed" });
    } finally {
      setPendingPasswordAction(null);
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
      setMessage({ type: "success", text: `Status changed to ${nextStatus}.` });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Unable to update ambassador status" });
    } finally {
      setStatusUpdating(false);
      setPendingStatusAction(null);
    }
  };

  const updateVerification = async (nextVerified: boolean) => {
    if (!ambassador?.id) return;
    setVerificationUpdating(true);
    try {
      const res = await authFetch(`/api/ambassadors/${ambassador.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_verified: nextVerified }),
      });
      const body = (await res.json()) as { success?: boolean; error?: string; ambassador?: AmbassadorDetails };
      if (!res.ok || body.success !== true) throw new Error(body.error || "Unable to update verification status");
      setAmbassador(body.ambassador || ambassador);
      setMessage({ type: "success", text: nextVerified ? "Ambassador marked as verified." : "Verified status removed." });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Unable to update verification status" });
    } finally {
      setVerificationUpdating(false);
      setPendingVerificationAction(null);
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
      setMessage({ type: "success", text: "Profile changes saved." });
      setProfileImageBase64(null);
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Unable to save profile changes" });
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
        setMessage({ type: "success", text: "Profile image ready to upload." });
      }
    };
    reader.readAsDataURL(file);
  };

  const copyReferralValue = async (value: string, kind: "code" | "link") => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedReferral(kind);
      setMessage({ type: "success", text: `Referral ${kind} copied to clipboard.` });
      window.setTimeout(() => setCopiedReferral((current) => (current === kind ? null : current)), 2000);
    } catch {
      setMessage({ type: "error", text: `Unable to copy the referral ${kind}. Please select and copy it manually.` });
    }
  };

  if (loading) {
    return (
      <Card>
        <LoadingState label="Loading ambassador details…" />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Ambassador profile"
        title={ambassador?.full_name || "Ambassador"}
        actions={
          <Link href="/admin/ambassadors" className="btn-muted">
            Back to list
          </Link>
        }
      />

      {message && (
        <div className={`rounded-2xl border px-4 py-3 text-sm font-medium ${message.type === "success" ? "border-success/20 bg-success/10 text-success" : "border-danger/20 bg-danger/10 text-danger"}`}>
          {message.text}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.3fr_0.9fr]">
        <div className="space-y-6">
          <Card>
            <div className="flex flex-col gap-4 md:flex-row md:items-start">
              <div className="h-28 w-28 overflow-hidden rounded-full bg-gray-100">
                {ambassador?.profile_image_url ? (
                  <Image src={ambassador.profile_image_url} alt={ambassador.full_name || "Profile"} width={112} height={112} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-lg font-bold text-gray-500">TH</div>
                )}
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={ambassador?.is_verified ? "success" : "neutral"}>{ambassador?.is_verified ? "✓ Verified Campus Ambassador" : "Unverified ambassador"}</Badge>
                  <Badge tone={ambassadorStatusTone(ambassador?.status)}>{ambassador?.status || "active"}</Badge>
                </div>
                <div className="mt-3 text-sm text-gray-500">
                  <p className="text-lg font-bold text-gray-800">{ambassador?.referral_code || "—"}</p>
                  <p className="mt-1">
                    {ambassador?.university || "—"} • {ambassador?.program || "—"}
                  </p>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="muted" onClick={() => setPendingPasswordAction("send-reset")}>
                    Reset password
                  </Button>
                  <Button variant="muted" onClick={() => setPendingPasswordAction("temporary-password")}>
                    Generate temporary password
                  </Button>
                  <Button variant="danger-solid" onClick={() => setPendingStatusAction("suspended")} disabled={statusUpdating}>
                    Suspend account
                  </Button>
                  <Button variant="primary" onClick={() => setPendingStatusAction("active")} disabled={statusUpdating}>
                    Reactivate
                  </Button>
                  {ambassador?.is_verified ? (
                    <Button variant="muted" onClick={() => setPendingVerificationAction("unverify")} disabled={verificationUpdating}>
                      Remove verification
                    </Button>
                  ) : (
                    <Button variant="primary" onClick={() => setPendingVerificationAction("verify")} disabled={verificationUpdating}>
                      Verify ambassador
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </Card>

            <div className="rounded-2xl border border-primary-200 bg-primary-50 p-6 shadow-sm">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-700">Ambassador referrals</p>
                <h2 className="mt-1 text-lg font-black text-gray-800">Referral code and link</h2>
                <p className="mt-1 text-sm text-gray-600">Share this link with customers so their bookings are credited to this ambassador.</p>
              </div>

              <div className="mt-5 grid gap-4">
                <div>
                  <label htmlFor="ambassador-referral-code" className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Referral code</label>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <input
                      id="ambassador-referral-code"
                      value={ambassador?.referral_code || "Not available"}
                      readOnly
                      className="input-field min-w-0 flex-1 bg-white font-mono font-semibold"
                    />
                    <button
                      type="button"
                      onClick={() => void copyReferralValue(ambassador?.referral_code || "", "code")}
                      disabled={!ambassador?.referral_code}
                      className="whitespace-nowrap rounded-xl border border-primary-200 bg-white px-4 py-3 text-sm font-semibold text-primary-800 transition hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {copiedReferral === "code" ? "Code copied" : "Copy code"}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="ambassador-referral-link" className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Referral link</label>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <input
                      id="ambassador-referral-link"
                      value={referralLink || "Not available"}
                      readOnly
                      className="input-field min-w-0 flex-1 bg-white text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => void copyReferralValue(referralLink, "link")}
                      disabled={!referralLink}
                      className="whitespace-nowrap rounded-xl bg-primary-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {copiedReferral === "link" ? "Link copied" : "Copy referral link"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-black text-gray-800">Personal information</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Full name</p><p className="mt-1 text-sm font-semibold text-gray-800">{ambassador?.full_name || "—"}</p></div>
                <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Student ID</p><p className="mt-1 text-sm text-gray-700">{ambassador?.student_id || "—"}</p></div>
                <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Email</p><p className="mt-1 text-sm text-gray-700">{ambassador?.email || "—"}</p></div>
                <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Phone</p><p className="mt-1 text-sm text-gray-700">{ambassador?.phone || "—"}</p></div>
                <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">WhatsApp</p><p className="mt-1 text-sm text-gray-700">{ambassador?.whatsapp_number || "—"}</p></div>
                <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">University</p><p className="mt-1 text-sm text-gray-700">{ambassador?.university || "—"}</p></div>
                <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Faculty</p><p className="mt-1 text-sm text-gray-700">{ambassador?.faculty || "—"}</p></div>
                <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Programme</p><p className="mt-1 text-sm text-gray-700">{ambassador?.program || "—"}</p></div>
                <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Year of study</p><p className="mt-1 text-sm text-gray-700">{ambassador?.year_of_study || "—"}</p></div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-black text-gray-800">Referral performance</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {[
                  ["Total referral clicks", stats?.totalReferrals ?? 0],
                  ["Total applications referred", stats?.totalApplicationsReferred ?? 0],
                  ["Successful bookings", stats?.successfulBookings ?? 0],
                  ["Conversion rate", `${stats?.conversionRate ?? 0}%`],
                  ["Commission earned", formatCurrency(stats?.totalCommission ?? 0)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-gray-200 bg-gray-100 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">{label}</p>
                    <p className="mt-2 text-xl font-black text-gray-800">{value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-black text-gray-800">Booking history</h2>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-3 py-3 text-left font-semibold text-gray-700">Booking ID</th>
                      <th className="px-3 py-3 text-left font-semibold text-gray-700">Customer</th>
                      <th className="px-3 py-3 text-left font-semibold text-gray-700">Route</th>
                      <th className="px-3 py-3 text-left font-semibold text-gray-700">Date</th>
                      <th className="px-3 py-3 text-left font-semibold text-gray-700">Amount</th>
                      <th className="px-3 py-3 text-left font-semibold text-gray-700">Commission</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(stats?.bookings || []).length === 0 ? (
                      <tr><td className="px-3 py-4 text-gray-500" colSpan={6}>No bookings available yet.</td></tr>
                    ) : (stats?.bookings || []).map((booking) => (
                      <tr key={String(booking.id)}>
                        <td className="px-3 py-3 text-gray-700">{String(booking.id || "—")}</td>
                        <td className="px-3 py-3 text-gray-700">{String(booking.customer_name || booking.customer || "—")}</td>
                        <td className="px-3 py-3 text-gray-700">{String(booking.route || "—")}</td>
                        <td className="px-3 py-3 text-gray-700">{formatDate(String(booking.created_at || booking.travel_date || ""))}</td>
                        <td className="px-3 py-3 text-gray-700">{formatCurrency(Number(booking.amount || booking.fare || 0))}</td>
                        <td className="px-3 py-3 text-gray-700">{formatCurrency(Number(booking.commission_amount || 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-black text-gray-800">Activity timeline</h2>
              <div className="mt-4 space-y-3">
                {(stats?.activity || []).length === 0 ? (
                  <p className="text-sm text-gray-500">No recent activity yet.</p>
                ) : (stats?.activity || []).map((item, index) => (
                  <div key={String(item.id || index)} className="rounded-2xl border border-gray-200 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-gray-800">{String(item.activity_type || "Activity")}</p>
                        <p className="text-sm text-gray-500">{String(item.description || "—")}</p>
                      </div>
                      <span className="text-xs text-gray-500">{formatDate(String(item.created_at || ""))}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-black text-gray-800">Account information</h2>
              <div className="mt-4 space-y-3 text-sm">
                <div className="rounded-2xl border border-gray-200 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Account created</p>
                  <p className="mt-1 font-semibold text-gray-800">{formatDate(ambassador?.created_at)}</p>
                </div>
                <div className="rounded-2xl border border-gray-200 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Last login</p>
                  <p className="mt-1 font-semibold text-gray-800">{formatDate(ambassador?.last_login)}</p>
                </div>
                <div className="rounded-2xl border border-gray-200 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Status</p>
                  <p className="mt-1 font-semibold text-gray-800">{ambassador?.status || "active"}</p>
                </div>
                <div className="rounded-2xl border border-gray-200 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Verification status</p>
                  <p className="mt-1 font-semibold text-gray-800">{ambassador?.is_verified ? "Verified by admin" : "Not yet verified"}</p>
                </div>
              </div>
            </div>

            <form onSubmit={saveProfile} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-black text-gray-800">Edit profile</h2>
              <div className="mt-4 grid gap-3">
                <input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Phone" className="input-field" />
                <input value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="Email" className="input-field" />
                <input value={form.whatsapp_number} onChange={(event) => setForm((current) => ({ ...current, whatsapp_number: event.target.value }))} placeholder="WhatsApp number" className="input-field" />
                <label className="rounded-2xl border border-dashed border-gray-300 p-3 text-sm text-gray-600">
                  <span className="mb-2 block font-semibold text-gray-700">Upload profile photo</span>
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleImageSelection} className="block w-full text-sm" />
                </label>
                {profileImageBase64 && <p className="text-sm text-emerald-700">New photo selected and will be uploaded on save.</p>}
                <input value={form.university} onChange={(event) => setForm((current) => ({ ...current, university: event.target.value }))} placeholder="University" className="input-field" />
                <input value={form.faculty} onChange={(event) => setForm((current) => ({ ...current, faculty: event.target.value }))} placeholder="Faculty" className="input-field" />
                <input value={form.program} onChange={(event) => setForm((current) => ({ ...current, program: event.target.value }))} placeholder="Programme" className="input-field" />
                <button type="submit" disabled={savingProfile} className="rounded-xl bg-primary-700 px-4 py-3 text-sm font-semibold text-white hover:bg-primary-800 disabled:opacity-50">
                  {savingProfile ? "Saving..." : "Save profile changes"}
                </button>
              </div>
            </form>
          </div>
        </div>

      <ConfirmDialog
        open={pendingPasswordAction !== null}
        title={pendingPasswordAction === "send-reset" ? "Send password reset email?" : "Generate a temporary password?"}
        description={
          pendingPasswordAction === "send-reset"
            ? `Send a password reset email to ${ambassador?.full_name || ambassador?.email}?`
            : `Generate a temporary password for ${ambassador?.full_name || ambassador?.email}? The new password will be shown once.`
        }
        confirmLabel={pendingPasswordAction === "send-reset" ? "Send email" : "Generate password"}
        onConfirm={() => {
          if (pendingPasswordAction) return resetPassword(pendingPasswordAction);
        }}
        onCancel={() => setPendingPasswordAction(null)}
      />

      <ConfirmDialog
        open={pendingStatusAction !== null}
        title={pendingStatusAction === "suspended" ? "Suspend this ambassador?" : "Reactivate this ambassador?"}
        description={
          pendingStatusAction === "suspended"
            ? "They will immediately lose access to the ambassador portal and their referral link will stop attributing new bookings."
            : "This restores portal access and re-enables referral attribution for this ambassador."
        }
        confirmLabel={pendingStatusAction === "suspended" ? "Suspend" : "Reactivate"}
        danger={pendingStatusAction === "suspended"}
        onConfirm={() => {
          if (pendingStatusAction) return updateStatus(pendingStatusAction);
        }}
        onCancel={() => setPendingStatusAction(null)}
      />

      <ConfirmDialog
        open={pendingVerificationAction !== null}
        title={pendingVerificationAction === "verify" ? "Verify this ambassador?" : "Remove verified status?"}
        description={
          pendingVerificationAction === "verify"
            ? `Mark ${ambassador?.full_name || "this ambassador"} as a verified Campus Ambassador based on their performance? They'll display a verified badge across the platform.`
            : `Remove the verified badge from ${ambassador?.full_name || "this ambassador"}?`
        }
        confirmLabel={pendingVerificationAction === "verify" ? "Verify" : "Remove verification"}
        danger={pendingVerificationAction === "unverify"}
        onConfirm={() => {
          if (pendingVerificationAction) return updateVerification(pendingVerificationAction === "verify");
        }}
        onCancel={() => setPendingVerificationAction(null)}
      />
    </div>
  );
}
