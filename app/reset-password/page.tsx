"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/auth";

function getRecoveryParams() {
  if (typeof window === "undefined") {
    return null;
  }

  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  const hashParams = new URLSearchParams(hash);
  const queryParams = new URLSearchParams(window.location.search);

  return {
    // access_token/refresh_token are real bearer credentials — only ever
    // read from the hash fragment, which browsers never send to a server
    // (not in the request line, not in Referer). A query-string version of
    // the same token can land in server/proxy access logs. `code` (the PKCE
    // flow) is designed to be a single-use, short-lived query param, so it
    // stays accepted from either.
    accessToken: hashParams.get("access_token"),
    refreshToken: hashParams.get("refresh_token"),
    code: hashParams.get("code") || queryParams.get("code"),
    type: hashParams.get("type") || queryParams.get("type"),
    errorDescription: hashParams.get("error_description") || queryParams.get("error_description"),
  };
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const initializeRecoverySession = async () => {
      try {
        const params = getRecoveryParams();

        if (!params) {
          if (!active) return;
          setMessage("This password reset link is missing its recovery parameters.");
          setIsError(true);
          setLoading(false);
          return;
        }

        if (params.errorDescription) {
          if (!active) return;
          setMessage("This password reset link is invalid or has expired. Please request a new one.");
          setIsError(true);
          setLoading(false);
          return;
        }

        if (params.accessToken && params.refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: params.accessToken,
            refresh_token: params.refreshToken,
          });

          if (error) {
            throw error;
          }
        } else if (params.code) {
          const { error } = await supabase.auth.exchangeCodeForSession(params.code);
          if (error) {
            throw error;
          }
        } else {
          throw new Error("This password reset link is invalid.");
        }

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (!active) return;

        if (userError || !user?.email) {
          throw new Error("Your recovery session is invalid or has expired. Please request a new password reset link.");
        }

        setEmail(user.email);
        setMessage("Choose a new password for your account.");
        setIsError(false);
      } catch (error) {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "Unable to start the password reset flow.");
        setIsError(true);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void initializeRecoverySession();

    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    setIsError(false);

    if (!password || password.length < 8) {
      setMessage("Please choose a password that is at least 8 characters long.");
      setIsError(true);
      setSubmitting(false);
      return;
    }

    if (password !== confirmPassword) {
      setMessage("The passwords do not match. Please try again.");
      setIsError(true);
      setSubmitting(false);
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        throw error;
      }

      setPassword("");
      setConfirmPassword("");
      setMessage("Password updated successfully. You can now sign in with your new password.");
      setIsError(false);
      window.setTimeout(() => {
        router.replace("/login");
      }, 1200);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update your password right now.");
      setIsError(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-md rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#0A4D8C]">Secure reset</p>
        <h1 className="mt-2 text-2xl font-black text-slate-900">Create a new password</h1>
        <p className="mt-2 text-sm text-slate-600">
          {email ? `Set a new password for ${email}.` : "Use the recovery link from your email to continue."}
        </p>

        {message ? (
          <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${isError ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
            {message}
          </div>
        ) : null}

        {!loading ? (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700" htmlFor="new-password">New password</label>
              <input
                id="new-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter a new password"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-[#0A4D8C] focus:ring-4 focus:ring-[#0A4D8C]/10"
                autoComplete="new-password"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700" htmlFor="confirm-password">Confirm password</label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Confirm your new password"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-[#0A4D8C] focus:ring-4 focus:ring-[#0A4D8C]/10"
                autoComplete="new-password"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-2xl bg-[#0A4D8C] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#083a6b] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Updating password..." : "Update password"}
            </button>
          </form>
        ) : (
          <div className="mt-6 text-sm text-slate-600">Preparing your secure reset session...</div>
        )}

        <Link href="/admin/login" className="mt-6 inline-flex text-sm font-semibold text-[#0A4D8C] hover:text-[#083a6b]">
          Back to login
        </Link>
      </div>
    </div>
  );
}
