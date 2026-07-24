"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { supabase } from "@/lib/auth";

export default function AmbassadorSecurityPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showPasswords, setShowPasswords] = useState(false);

  const passwordScore = useMemo(() => {
    let score = 0;
    if (newPassword.length >= 10) score += 1;
    if (/[A-Z]/.test(newPassword)) score += 1;
    if (/[0-9]/.test(newPassword)) score += 1;
    if (/[^A-Za-z0-9]/.test(newPassword)) score += 1;
    return score;
  }, [newPassword]);

  const passwordLabel = passwordScore <= 1 ? "Weak" : passwordScore <= 2 ? "Fair" : passwordScore <= 3 ? "Strong" : "Excellent";

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user?.email) {
        throw new Error("Unable to verify current ambassador session");
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: userData.user.email,
        password: currentPassword,
      });

      if (signInError) {
        throw new Error("Current password is incorrect.");
      }

      if (newPassword.length < 8) {
        throw new Error("New password must be at least 8 characters long.");
      }

      if (newPassword !== confirmPassword) {
        throw new Error("New password and confirm password must match.");
      }

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw new Error(updateError.message || "Unable to update password.");

      setMessage("Password updated successfully. Please sign in with your new password on your next device session.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to change password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#0f3f78]">Security</p>
              <h1 className="mt-2 text-3xl font-black text-slate-900">Change password</h1>
            </div>
            <div className="flex gap-2">
              <Link href="/ambassador/profile" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Profile</Link>
              <Link href="/ambassador/dashboard" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Dashboard</Link>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-4">
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Current password</label>
              <input type={showPasswords ? "text" : "password"} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="input-field" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">New password</label>
              <input type={showPasswords ? "text" : "password"} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="input-field" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Confirm new password</label>
              <input type={showPasswords ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="input-field" />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700">Password strength</span>
                <span className="text-xs font-semibold text-slate-600">{passwordLabel}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full rounded-full bg-[#0f3f78]" style={{ width: `${Math.min(100, passwordScore * 25)}%` }} />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={showPasswords} onChange={(event) => setShowPasswords(event.target.checked)} />
              Show passwords
            </label>

            <button type="submit" disabled={loading} className="rounded-xl bg-[#0f3f78] px-4 py-3 text-sm font-semibold text-white hover:bg-[#0a2d56] disabled:opacity-50">
              {loading ? "Updating..." : "Update password"}
            </button>
          </div>

          {message && <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-900">{message}</div>}
        </form>
      </div>
    </div>
  );
}
