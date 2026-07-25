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

export default function LoginPage() {
  const [username, setUsername] = useState("");
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
        email: username.trim(),
        password: password,
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

      const normalizedEmail = (data.user?.email || username).trim().toLowerCase();
      const configuredAdminEmails = [process.env.ADMIN_NOTIFICATION_EMAIL, process.env.ADMIN_EMAIL, "hgkalambo@gmail.com"]
        .filter((value): value is string => typeof value === "string" && value.trim() !== "")
        .map((value) => value.trim().toLowerCase());
      const isConfiguredAdmin = configuredAdminEmails.includes(normalizedEmail);

      if (isConfiguredAdmin) {
        window.location.assign("/admin/dashboard");
        return;
      }

      const profileRes = await authFetch("/api/profile", { method: "GET" });

      if (profileRes.ok) {
        const profileData = await profileRes.json();
        const role = normalizeAdminRole(profileData?.profile?.role ?? profileData?.role);
        const status = String(profileData?.profile?.status || "active").toLowerCase();

        if (role === "unknown") {
          window.location.assign("/admin/dashboard?accessDenied=1");
          return;
        }

        if (role === "viewer") {
          window.location.assign("/admin/dashboard");
          return;
        }

        if (role === "super_admin") {
          window.location.assign("/admin/dashboard");
          return;
        }

        if (status === "suspended" || status === "inactive") {
          setErrorMsg("This ambassador account is currently suspended.");
          await supabase.auth.signOut();
          setLoading(false);
          return;
        }

        try {
          await authFetch("/api/profile", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ last_login: true }),
          });
        } catch (loginTrackingError) {
          console.warn("Failed to record ambassador login", loginTrackingError);
        }

        window.location.assign("/ambassador/dashboard");
        return;
      }

      window.location.assign("/admin/dashboard");
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Login failed. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-shell flex min-h-screen">
      <div className="hidden w-1/2 flex-col items-center justify-center bg-[linear-gradient(135deg,var(--primary-900)_0%,var(--gray-800)_100%)] p-10 text-white md:flex">
        <Image
          src="/logo.png"
          width={112}
          height={112}
          className="mb-6 object-contain"
          alt="Travel with Hawkins Logo"
        />

        <h1 className="text-center text-3xl font-bold">Travel with Hawkins</h1>
        <p className="mt-2 max-w-xs text-center text-sm text-primary-200">
          Student transport operations for a premium university service experience.
        </p>

        <div className="mt-10 space-y-2 text-center text-xs text-primary-200">
          <p>Secure admin access</p>
          <p>Real-time booking control</p>
          <p>Modern trip management</p>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center bg-[color:var(--off-white)] px-4 py-6 sm:px-6 sm:py-10">
        <div className="w-full max-w-md rounded-[28px] border border-[color:var(--gray-200)] bg-[color:var(--white)] p-6 shadow-[0_18px_45px_rgba(26,15,0,0.08)] sm:p-8">
          <div className="mb-6 flex flex-col items-center md:hidden">
            <Image
              src="/logo.png"
              width={64}
              height={64}
              className="mb-2 object-contain"
              alt="Travel with Hawkins Logo"
            />
            <h1 className="text-lg font-bold text-gray-800">Travel with Hawkins</h1>
          </div>

          <h2 className="mb-1 text-2xl font-bold text-gray-800">Admin Login</h2>
          <p className="mb-6 text-sm text-gray-600">Enter your credentials to access the dashboard.</p>

          {errorMsg && (
            <div className="mb-4 rounded-2xl border border-danger/20 bg-danger/10 p-3 text-sm text-danger">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleLogin}>            
            <div className="mb-4">
              <label className="mb-1 block text-sm font-semibold text-gray-600">Email</label>
              <input
                type="email"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter admin email"
                className="input-field mt-1"
                autoComplete="email"
                name="email"
              />
            </div>

            <div className="mb-6">
              <label className="mb-1 block text-sm font-semibold text-gray-600">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="input-field mt-1"
                autoComplete="current-password"
                name="password"
              />
            </div>

            <div className="mb-3 flex items-center justify-end">
              <button
                type="button"
                onClick={async () => {
                  const result = await handleForgotPassword(username);
                  setResetMessage(result.message);
                }}
                className="text-sm font-semibold text-[#0A4D8C]"
              >
                Forgot Password?
              </button>
            </div>

            <div className="sticky bottom-3 z-10 mt-6 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full rounded-2xl py-3.5 text-sm font-semibold shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Logging in..." : "Login to Dashboard"}
              </button>
            </div>
          </form>

          {resetMessage && <p className="mt-4 text-sm text-slate-700">{resetMessage}</p>}

          <p className="mt-6 text-center text-xs text-gray-500">Secure Transport Management System</p>
        </div>
      </div>
    </div>
  );
}