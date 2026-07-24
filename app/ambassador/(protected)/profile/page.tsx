"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { authFetch, supabase } from "@/lib/auth";

type AmbassadorProfile = {
  id?: string;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  university?: string | null;
  program?: string | null;
  status?: string | null;
  profile_image_url?: string | null;
  referral_code?: string | null;
};

export default function AmbassadorProfilePage() {
  const [profile, setProfile] = useState<AmbassadorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({ phone: "", whatsapp_number: "" });
  const [profileImageBase64, setProfileImageBase64] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [profileRes, referralsRes] = await Promise.all([
          authFetch("/api/profile", { method: "GET" }),
          authFetch("/api/referrals", { method: "GET" }),
        ]);

        if (profileRes.ok) {
          const profileData = (await profileRes.json()) as { profile?: AmbassadorProfile };
          setProfile(profileData.profile || null);
          setForm({
            phone: profileData.profile?.phone || "",
            whatsapp_number: "",
          });
        }

        if (referralsRes.ok) {
          const referralsData = (await referralsRes.json()) as { referrals?: Array<Record<string, unknown>> };
          console.log("Referral metrics loaded", referralsData.referrals?.length || 0);
        }
      } catch (error) {
        console.error("Failed to load ambassador profile", error);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const saveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profile?.id) return;
    setSaving(true);
    setMessage(null);

    try {
      const res = await authFetch(`/api/ambassadors/${profile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: form.phone,
          whatsapp_number: form.whatsapp_number,
          profileImageBase64: profileImageBase64 || undefined,
        }),
      });
      const body = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || body.success !== true) throw new Error(body.error || "Unable to update profile");
      setMessage("Profile updated successfully.");
      setProfileImageBase64(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update profile");
    } finally {
      setSaving(false);
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/ambassador/login";
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-50 p-6 text-sm text-slate-500">Loading ambassador profile…</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#0f3f78]">Ambassador account</p>
              <h1 className="mt-2 text-3xl font-black text-slate-900">Profile management</h1>
            </div>
            <div className="flex gap-2">
              <Link href="/ambassador/dashboard" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Dashboard</Link>
              <Link href="/ambassador/settings/security" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Security</Link>
              <button onClick={() => void handleLogout()} className="rounded-xl bg-[#0f3f78] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0a2d56]">Logout</button>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 overflow-hidden rounded-full bg-slate-100">
                {profile?.profile_image_url ? (
                  <img src={profile.profile_image_url} alt={profile.full_name || "Profile"} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm font-bold text-slate-500">TW</div>
                )}
              </div>
              <div>
                <p className="text-xl font-black text-slate-900">{profile?.full_name || "Ambassador"}</p>
                <p className="text-sm text-slate-500">{profile?.referral_code || "—"}</p>
                <p className="text-sm text-slate-500">{profile?.university || "—"} • {profile?.program || "—"}</p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Status</p>
                <p className="mt-1 font-semibold text-slate-900">{profile?.status || "Active"}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Email</p>
                <p className="mt-1 font-semibold text-slate-900">{profile?.email || "—"}</p>
              </div>
            </div>
          </div>

          <form onSubmit={saveProfile} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-black text-slate-900">Edit account details</h2>
            <div className="mt-4 grid gap-3">
              <input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Phone number" className="input-field" />
              <input value={form.whatsapp_number} onChange={(event) => setForm((current) => ({ ...current, whatsapp_number: event.target.value }))} placeholder="WhatsApp number" className="input-field" />
              <label className="rounded-2xl border border-dashed border-slate-300 p-3 text-sm text-slate-600">
                <span className="mb-2 block font-semibold text-slate-700">Upload profile photo</span>
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleImageSelection} className="block w-full text-sm" />
              </label>
              {profileImageBase64 && <p className="text-sm text-emerald-700">New photo selected and will be uploaded on save.</p>}
              <button type="submit" disabled={saving} className="rounded-xl bg-[#0f3f78] px-4 py-3 text-sm font-semibold text-white hover:bg-[#0a2d56] disabled:opacity-50">
                {saving ? "Saving..." : "Save profile"}
              </button>
            </div>
            {message && <p className="mt-3 text-sm text-slate-700">{message}</p>}
          </form>
        </div>
      </div>
    </div>
  );
}
