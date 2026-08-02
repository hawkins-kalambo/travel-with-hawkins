"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { authFetch } from "@/lib/auth";
import Card from "@/app/components/ui/Card";
import PageHeader from "@/app/components/ui/PageHeader";
import Button from "@/app/components/ui/Button";
import { LoadingState } from "@/app/components/ui/Spinner";

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

type FormMessage = { type: "success" | "error"; text: string };

export default function AmbassadorProfilePage() {
  const [profile, setProfile] = useState<AmbassadorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<FormMessage | null>(null);
  const [form, setForm] = useState({ phone: "", whatsapp_number: "" });
  const [profileImageBase64, setProfileImageBase64] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const profileRes = await authFetch("/api/profile", { method: "GET" });

        if (profileRes.ok) {
          const profileData = (await profileRes.json()) as { profile?: AmbassadorProfile };
          setProfile(profileData.profile || null);
          setForm({
            phone: profileData.profile?.phone || "",
            whatsapp_number: "",
          });
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
      const res = await authFetch("/api/ambassadors/me", {
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
      setMessage({ type: "success", text: "Profile updated successfully." });
      setProfileImageBase64(null);
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Unable to update profile" });
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
        setMessage({ type: "success", text: "New photo selected and will be uploaded on save." });
      }
    };
    reader.readAsDataURL(file);
  };

  if (loading) {
    return (
      <Card>
        <LoadingState label="Loading ambassador profile…" />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Ambassador account"
        title="Profile management"
        actions={
          <Link href="/ambassador/settings/security" className="btn-muted">
            Security
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card>
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 overflow-hidden rounded-full bg-gray-100">
              {profile?.profile_image_url ? (
                <Image src={profile.profile_image_url} alt={profile.full_name || "Profile"} width={80} height={80} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm font-bold text-gray-500">TW</div>
              )}
            </div>
            <div>
              <p className="text-xl font-black text-gray-800">{profile?.full_name || "Ambassador"}</p>
              <p className="text-sm text-gray-500">{profile?.referral_code || "—"}</p>
              <p className="text-sm text-gray-500">
                {profile?.university || "—"} • {profile?.program || "—"}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Status</p>
              <p className="mt-1 font-semibold text-gray-800">{profile?.status || "Active"}</p>
            </div>
            <div className="rounded-2xl border border-gray-200 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Email</p>
              <p className="mt-1 font-semibold text-gray-800">{profile?.email || "—"}</p>
            </div>
          </div>
        </Card>

        <Card>
          <form onSubmit={saveProfile}>
            <h2 className="text-lg font-black text-gray-800">Edit account details</h2>
            <div className="mt-4 grid gap-3">
              <input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Phone number" className="input-field" />
              <input
                value={form.whatsapp_number}
                onChange={(event) => setForm((current) => ({ ...current, whatsapp_number: event.target.value }))}
                placeholder="WhatsApp number"
                className="input-field"
              />
              <label className="rounded-2xl border border-dashed border-gray-300 p-3 text-sm text-gray-600">
                <span className="mb-2 block font-semibold text-gray-700">Upload profile photo</span>
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleImageSelection} className="block w-full text-sm" />
              </label>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save profile"}
              </Button>
            </div>
            {message && (
              <p className={`mt-3 text-sm font-medium ${message.type === "success" ? "text-success" : "text-danger"}`}>{message.text}</p>
            )}
          </form>
        </Card>
      </div>
    </div>
  );
}
