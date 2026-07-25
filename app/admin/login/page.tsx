"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import { authFetch, supabase } from "@/lib/auth";
import { normalizeAdminRole } from "@/lib/adminAuth";

async function handleForgotPassword(email: string) {
  if (!email) {
    return { success: false, message: "Please enter your email address first." };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://travel-with-hawkins.vercel.app";
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${appUrl.replace(/\/$/, "")}/reset-password`,
  });

  if (error) {
    return { success: false, message: error.message || "Unable to send reset email." };
  }

  return { success: true, message: "Password reset link sent. Please check your inbox." };
}

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [resetMessage, setResetMessage] = useState("");

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setErrorMsg("");

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setErrorMsg(error.message || "Invalid login details");
        setLoading(false);
        return;
      }

      if (!data.session) {
        setErrorMsg("No session returned. Please try again.");
        setLoading(false);
        return;
      }

      const normalizedEmail = (data.user?.email || email).trim().toLowerCase();
      const configuredAdminEmails = [process.env.ADMIN_NOTIFICATION_EMAIL, process.env.ADMIN_EMAIL, "hgkalambo@gmail.com"]
        .filter((value): value is string => typeof value === "string" && value.trim() !== "")
        .map((value) => value.trim().toLowerCase());
      const isConfiguredAdmin = configuredAdminEmails.includes(normalizedEmail);

      if (isConfiguredAdmin) {
        window.location.assign("/admin/dashboard");
        return;
      }

      const profileRes = await authFetch("/api/profile", { method: "GET" });
      if (!profileRes.ok) {
        setErrorMsg("Unable to load user profile. Please try again.");
        setLoading(false);
        return;
      }

      const profileData = await profileRes.json();
      const role = normalizeAdminRole(profileData?.profile?.role ?? profileData?.role);

      if (role === "unknown" && !isConfiguredAdmin) {
        window.location.assign("/admin/dashboard?accessDenied=1");
        return;
      }

      window.location.assign("/admin/dashboard");
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(10,77,140,0.08)] lg:flex-row">
        <div className="flex flex-1 flex-col justify-center bg-[linear-gradient(135deg,#0A4D8C_0%,#0f3f78_55%,#F7931E_100%)] p-8 text-white sm:p-12 lg:w-[45%]">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" width={56} height={56} className="rounded-full object-cover" alt="Travel with Hawkins logo" />
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-100">Travel with Hawkins</p>
              <p className="text-lg font-semibold text-white">Secure Admin Portal</p>
            </div>
          </div>
          <div className="mt-10 max-w-md">
            <h1 className="text-3xl font-black leading-tight sm:text-4xl">Admin Access</h1>
            <p className="mt-4 text-base text-slate-100/90">
              Sign in to manage ambassadors, referrals, bookings, and system settings.
            </p>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center p-6 sm:p-8 lg:p-10">
          <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="mb-6 text-center lg:text-left">
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#0A4D8C]">Admin Portal</p>
              <h2 className="mt-2 text-2xl font-black text-slate-900">Sign in to your account</h2>
            </div>

            {errorMsg ? (
              <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{errorMsg}</div>
            ) : null}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label htmlFor="admin-email" className="mb-1 block text-sm font-semibold text-slate-700">
                  Email
                </label>
                <input
                  id="admin-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Enter your admin email"
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-[#0A4D8C] focus:ring-4 focus:ring-[#0A4D8C]/10"
                  autoComplete="email"
                />
              </div>

              <div>
                <label htmlFor="admin-password" className="mb-1 block text-sm font-semibold text-slate-700">
                  Password
                </label>
                <input
                  id="admin-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-[#0A4D8C] focus:ring-4 focus:ring-[#0A4D8C]/10"
                  autoComplete="current-password"
                />
              </div>

              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={async () => {
                    const result = await handleForgotPassword(email);
                    setResetMessage(result.message);
                  }}
                  className="text-sm font-semibold text-[#0A4D8C] hover:text-[#083a6b]"
                >
                  Forgot Password?
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-[#0A4D8C] px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-[#083a6b] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Signing in..." : "Login"}
              </button>
            </form>

            {resetMessage ? <p className="mt-4 text-sm text-slate-700">{resetMessage}</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
