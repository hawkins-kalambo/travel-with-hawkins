"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import type { CustomerProfile } from "@/lib/customerAuth";

export default function CustomerProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [formData, setFormData] = useState({
    fullName: "",
    phone: "",
    studentId: "",
    university: "",
    faculty: "",
    programme: "",
    yearOfStudy: "",
    preferredRoute: "",
    preferredPickupPoint: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
  });

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const user = await getCurrentUser();
        if (!user) {
          router.push("/customer/login");
          return;
        }

        const res = await fetch("/api/customers/profile");
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.profile) {
            setProfile(data.profile);
            setFormData({
              fullName: data.profile.fullName || "",
              phone: data.profile.phone || "",
              studentId: data.profile.studentId || "",
              university: data.profile.university || "",
              faculty: data.profile.faculty || "",
              programme: data.profile.programme || "",
              yearOfStudy: data.profile.yearOfStudy?.toString() || "",
              preferredRoute: data.profile.preferredRoute || "",
              preferredPickupPoint: data.profile.preferredPickupPoint || "",
              emergencyContactName: data.profile.emergencyContactName || "",
              emergencyContactPhone: data.profile.emergencyContactPhone || "",
            });
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load profile");
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [router]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setAvatarError("");

    if (!["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(file.type)) {
      setAvatarError("Please upload a JPEG, PNG, or WEBP image");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setAvatarError("Image must be smaller than 5MB");
      return;
    }

    setAvatarUploading(true);

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await fetch("/api/customers/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profilePictureBase64: base64 }),
      });

      const result = await res.json();

      if (!result.success) {
        setAvatarError(result.error || "Failed to upload profile picture");
        return;
      }

      setProfile(result.profile);
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "Failed to upload profile picture");
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const updateData: Record<string, unknown> = {
        fullName: formData.fullName,
        phone: formData.phone,
        studentId: formData.studentId || undefined,
        university: formData.university || undefined,
        faculty: formData.faculty || undefined,
        programme: formData.programme || undefined,
        yearOfStudy: formData.yearOfStudy ? parseInt(formData.yearOfStudy) : undefined,
        preferredRoute: formData.preferredRoute || undefined,
        preferredPickupPoint: formData.preferredPickupPoint || undefined,
        emergencyContactName: formData.emergencyContactName || undefined,
        emergencyContactPhone: formData.emergencyContactPhone || undefined,
      };

      const res = await fetch("/api/customers/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      });

      const result = await res.json();

      if (!result.success) {
        setError(result.error || "Failed to save profile");
        return;
      }

      setProfile(result.profile);
      setSuccess("Profile updated successfully!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-[#0A4D8C] mx-auto"></div>
          <p className="text-slate-600">Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <Link href="/customer/dashboard" className="flex items-center gap-3">
              <Image src="/logo.png" width={40} height={40} className="rounded-full object-cover" alt="Travel with Hawkins" />
              <span className="text-lg font-black text-[#0A4D8C]">Travel with Hawkins</span>
            </Link>

            <Link href="/customer/dashboard" className="text-sm font-semibold text-[#0A4D8C] hover:text-[#083a6b]">
              ← Back to Dashboard
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-black text-slate-900">My Profile</h1>
          <p className="mt-2 text-slate-600">Manage your personal and travel information</p>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
            {success}
          </div>
        )}

        {/* Profile Picture */}
        <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          <h2 className="mb-6 text-xl font-bold text-slate-900">Profile Picture</h2>

          <div className="flex items-center gap-6">
            {profile?.profilePictureUrl ? (
              <Image
                src={profile.profilePictureUrl}
                width={80}
                height={80}
                className="h-20 w-20 rounded-full object-cover"
                alt="Profile picture"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#0A4D8C] to-[#F7931E] text-xl font-bold text-white">
                {(profile?.fullName || "You")
                  .split(" ")
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((part) => part[0]?.toUpperCase())
                  .join("")}
              </div>
            )}

            <div>
              <label
                htmlFor="avatarUpload"
                className="inline-block cursor-pointer rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                {avatarUploading ? "Uploading..." : "Upload photo"}
              </label>
              <input
                id="avatarUpload"
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                onChange={handleAvatarChange}
                disabled={avatarUploading}
                className="hidden"
              />
              <p className="mt-2 text-xs text-slate-500">JPEG, PNG, or WEBP. Max 5MB.</p>
              {avatarError && <p className="mt-2 text-xs text-red-600">{avatarError}</p>}
            </div>
          </div>
        </div>

        {/* Account Information */}
        <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          <h2 className="mb-6 text-xl font-bold text-slate-900">Account Information</h2>

          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Customer ID</label>
              <input
                type="text"
                value={profile?.customerNumber || ""}
                disabled
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Customer Type</label>
              <input
                type="text"
                value={profile?.customerType?.replace("_", " ").toUpperCase() || ""}
                disabled
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Email Address</label>
              <input
                type="email"
                value={profile?.email || ""}
                disabled
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">Member Since</label>
              <input
                type="text"
                value={profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : ""}
                disabled
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500"
              />
            </div>
          </div>
        </div>

        {/* Personal Information Form */}
        <form onSubmit={handleSubmit}>
          <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
            <h2 className="mb-6 text-xl font-bold text-slate-900">Personal Information</h2>

            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <label htmlFor="fullName" className="mb-2 block text-sm font-semibold text-slate-700">
                  Full Name
                </label>
                <input
                  id="fullName"
                  name="fullName"
                  type="text"
                  value={formData.fullName}
                  onChange={handleChange}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-[#0A4D8C] focus:ring-4 focus:ring-[#0A4D8C]/10"
                />
              </div>

              <div>
                <label htmlFor="phone" className="mb-2 block text-sm font-semibold text-slate-700">
                  Phone Number
                </label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={handleChange}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-[#0A4D8C] focus:ring-4 focus:ring-[#0A4D8C]/10"
                />
              </div>
            </div>
          </div>

          {/* Student Information */}
          {profile?.customerType === "student" && (
            <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
              <h2 className="mb-6 text-xl font-bold text-slate-900">Student Information</h2>

              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <label htmlFor="studentId" className="mb-2 block text-sm font-semibold text-slate-700">
                    Student ID
                  </label>
                  <input
                    id="studentId"
                    name="studentId"
                    type="text"
                    value={formData.studentId}
                    onChange={handleChange}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-[#0A4D8C] focus:ring-4 focus:ring-[#0A4D8C]/10"
                  />
                </div>

                <div>
                  <label htmlFor="university" className="mb-2 block text-sm font-semibold text-slate-700">
                    University
                  </label>
                  <input
                    id="university"
                    name="university"
                    type="text"
                    value={formData.university}
                    onChange={handleChange}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-[#0A4D8C] focus:ring-4 focus:ring-[#0A4D8C]/10"
                  />
                </div>

                <div>
                  <label htmlFor="faculty" className="mb-2 block text-sm font-semibold text-slate-700">
                    Faculty
                  </label>
                  <input
                    id="faculty"
                    name="faculty"
                    type="text"
                    value={formData.faculty}
                    onChange={handleChange}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-[#0A4D8C] focus:ring-4 focus:ring-[#0A4D8C]/10"
                  />
                </div>

                <div>
                  <label htmlFor="programme" className="mb-2 block text-sm font-semibold text-slate-700">
                    Programme
                  </label>
                  <input
                    id="programme"
                    name="programme"
                    type="text"
                    value={formData.programme}
                    onChange={handleChange}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-[#0A4D8C] focus:ring-4 focus:ring-[#0A4D8C]/10"
                  />
                </div>

                <div>
                  <label htmlFor="yearOfStudy" className="mb-2 block text-sm font-semibold text-slate-700">
                    Year of Study
                  </label>
                  <select
                    id="yearOfStudy"
                    name="yearOfStudy"
                    value={formData.yearOfStudy}
                    onChange={handleChange}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-[#0A4D8C] focus:ring-4 focus:ring-[#0A4D8C]/10"
                  >
                    <option value="">Select year</option>
                    <option value="1">Year 1</option>
                    <option value="2">Year 2</option>
                    <option value="3">Year 3</option>
                    <option value="4">Year 4</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Travel Preferences */}
          <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
            <h2 className="mb-6 text-xl font-bold text-slate-900">Travel Preferences</h2>

            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <label htmlFor="preferredRoute" className="mb-2 block text-sm font-semibold text-slate-700">
                  Preferred Route
                </label>
                <input
                  id="preferredRoute"
                  name="preferredRoute"
                  type="text"
                  value={formData.preferredRoute}
                  onChange={handleChange}
                  placeholder="e.g., Mzuzu → Lilongwe"
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-[#0A4D8C] focus:ring-4 focus:ring-[#0A4D8C]/10"
                />
              </div>

              <div>
                <label htmlFor="preferredPickupPoint" className="mb-2 block text-sm font-semibold text-slate-700">
                  Preferred Pickup Point
                </label>
                <input
                  id="preferredPickupPoint"
                  name="preferredPickupPoint"
                  type="text"
                  value={formData.preferredPickupPoint}
                  onChange={handleChange}
                  placeholder="e.g., Mzuzu University"
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-[#0A4D8C] focus:ring-4 focus:ring-[#0A4D8C]/10"
                />
              </div>
            </div>
          </div>

          {/* Emergency Contact */}
          <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
            <h2 className="mb-6 text-xl font-bold text-slate-900">Emergency Contact</h2>

            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <label htmlFor="emergencyContactName" className="mb-2 block text-sm font-semibold text-slate-700">
                  Emergency Contact Name
                </label>
                <input
                  id="emergencyContactName"
                  name="emergencyContactName"
                  type="text"
                  value={formData.emergencyContactName}
                  onChange={handleChange}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-[#0A4D8C] focus:ring-4 focus:ring-[#0A4D8C]/10"
                />
              </div>

              <div>
                <label htmlFor="emergencyContactPhone" className="mb-2 block text-sm font-semibold text-slate-700">
                  Emergency Contact Phone
                </label>
                <input
                  id="emergencyContactPhone"
                  name="emergencyContactPhone"
                  type="tel"
                  value={formData.emergencyContactPhone}
                  onChange={handleChange}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-[#0A4D8C] focus:ring-4 focus:ring-[#0A4D8C]/10"
                />
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex gap-4">
            <button
              type="submit"
              disabled={saving}
              className="rounded-2xl bg-[#0A4D8C] px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-[#083a6b] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>

            <Link
              href="/customer/dashboard"
              className="rounded-2xl border border-slate-200 px-8 py-3.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}
