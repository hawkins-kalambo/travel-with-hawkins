"use client";

import { FormEvent, Suspense, useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/auth";
import { signInWithGoogle } from "@/lib/auth";

export default function CustomerLoginPage() {
  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen bg-gradient-to-br from-[#0A4D8C] to-[#0f3f78] px-4 py-8 sm:px-6 lg:px-8"
          role="status"
          aria-live="polite"
        >
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
              <div className="flex flex-col justify-center text-white lg:pr-12">
                <div className="mb-8 h-14 w-14 animate-pulse rounded-full bg-white/20" />
                <div className="space-y-4">
                  <div className="h-10 w-3/4 animate-pulse rounded-full bg-white/20" />
                  <div className="h-4 w-full animate-pulse rounded-full bg-white/20" />
                  <div className="h-4 w-5/6 animate-pulse rounded-full bg-white/20" />
                </div>
              </div>
              <div className="flex items-center justify-center">
                <div className="w-full max-w-md rounded-[28px] border border-white/20 bg-white p-6 shadow-2xl sm:p-8">
                  <div className="space-y-4">
                    <div className="h-4 w-1/2 animate-pulse rounded-full bg-slate-200" />
                    <div className="h-10 animate-pulse rounded-2xl bg-slate-200" />
                    <div className="h-10 animate-pulse rounded-2xl bg-slate-200" />
                    <div className="h-10 animate-pulse rounded-2xl bg-slate-200" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      }
    >
      <CustomerLoginContent />
    </Suspense>
  );
}

function CustomerLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const registered = searchParams.get("registered");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState("");

  useEffect(() => {
    if (registered) {
      setSuccessMessage("Registration successful! Please log in with your credentials.");
    }
  }, [registered]);

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/customers/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const result = await response.json();

      if (!result.success) {
        setError(result.error || "Login failed");
        setLoading(false);
        return;
      }

      // Redirect to customer dashboard
      window.location.assign("/customer/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!forgotEmail) {
      setError("Please enter your email address");
      return;
    }

    setResetLoading(true);
    setResetMessage("");

    try {
      const appUrl = window.location.origin;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
        redirectTo: `${appUrl}/reset-password`,
      });

      if (resetError) {
        setError(resetError.message || "Unable to send reset email");
        setResetLoading(false);
        return;
      }

      setResetMessage("Password reset link sent! Check your email.");
      setForgotEmail("");
      setTimeout(() => setForgotMode(false), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send reset email");
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A4D8C] to-[#0f3f78] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
          {/* Left Side - Branding */}
          <div className="flex flex-col justify-center text-white lg:pr-12">
            <Link href="/" className="mb-8 inline-flex w-fit items-center gap-3">
              <Image src="/logo.png" width={56} height={56} className="rounded-full object-cover" alt="Travel with Hawkins logo" />
              <span className="text-xl font-black">Travel with Hawkins</span>
            </Link>

            <div className="space-y-6">
              <div>
                <h1 className="text-4xl font-black leading-tight sm:text-5xl">Welcome Back</h1>
                <p className="mt-4 text-base text-slate-100/90">
                  Sign in to your account to book trips, view your boarding passes, and manage your bookings.
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/20">
                    <span className="text-sm font-bold">✓</span>
                  </div>
                  <p className="text-sm">Book trips easily with saved preferences</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/20">
                    <span className="text-sm font-bold">✓</span>
                  </div>
                  <p className="text-sm">Access your boarding passes anytime</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/20">
                    <span className="text-sm font-bold">✓</span>
                  </div>
                  <p className="text-sm">Link previous guest bookings automatically</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side - Login Form */}
          <div className="flex items-center justify-center">
            <div className="w-full max-w-md rounded-[28px] border border-white/20 bg-white p-6 shadow-2xl sm:p-8">
              <div className="mb-8 text-center">
                <h2 className="text-2xl font-black text-slate-900">Sign in to your account</h2>
                <p className="mt-2 text-sm text-slate-600">Stay updated on your trips and bookings</p>
              </div>

              {error && (
                <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              {successMessage && (
                <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                  {successMessage}
                </div>
              )}

              {resetMessage && (
                <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                  {resetMessage}
                </div>
              )}

              {!forgotMode ? (
                <>
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                      <label htmlFor="email" className="mb-2 block text-sm font-semibold text-slate-700">
                        Email Address
                      </label>
                      <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        required
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-[#0A4D8C] focus:ring-4 focus:ring-[#0A4D8C]/10"
                      />
                    </div>

                    <div>
                      <label htmlFor="password" className="mb-2 block text-sm font-semibold text-slate-700">
                        Password
                      </label>
                      <input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-[#0A4D8C] focus:ring-4 focus:ring-[#0A4D8C]/10"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => setForgotMode(true)}
                      className="text-sm font-semibold text-[#0A4D8C] hover:text-[#083a6b]"
                    >
                      Forgot Password?
                    </button>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full rounded-2xl bg-[#0A4D8C] px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-[#083a6b] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loading ? "Signing in..." : "Sign in"}
                    </button>
                  </form>

                  <div className="my-6 flex items-center gap-3">
                    <div className="flex-1 border-t border-slate-200"></div>
                    <span className="text-xs text-slate-500">or</span>
                    <div className="flex-1 border-t border-slate-200"></div>
                  </div>

                  <button
                    onClick={async () => {
                      setError("");
                      setGoogleLoading(true);
                      try {
                        const result = await signInWithGoogle();
                        if (!result.success) {
                          setError(result.error || "Unable to continue with Google");
                        }
                      } catch (err: unknown) {
                        setError(err instanceof Error ? err.message : "An error occurred");
                      } finally {
                        setGoogleLoading(false);
                      }
                    }}
                    disabled={googleLoading}
                    className="w-full flex items-center justify-center gap-3 rounded-2xl border border-slate-200 px-4 py-3.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                    </svg>
                    {googleLoading ? "Redirecting..." : "Continue with Google"}
                  </button>
                </>
              ) : (
                <>
                  <div className="space-y-4">
                    <p className="text-sm text-slate-600">Enter your email address and we'll send you a link to reset your password.</p>

                    <input
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="your@example.com"
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-[#0A4D8C] focus:ring-4 focus:ring-[#0A4D8C]/10"
                    />

                    <button
                      onClick={handleForgotPassword}
                      disabled={resetLoading}
                      className="w-full rounded-2xl bg-[#0A4D8C] px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-[#083a6b] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {resetLoading ? "Sending..." : "Send Reset Link"}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setForgotMode(false);
                        setError("");
                        setResetMessage("");
                      }}
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Back to Login
                    </button>
                  </div>
                </>
              )}

              {/* Sign Up Link */}
              <div className="mt-6 text-center">
                <p className="text-sm text-slate-600">
                  Don't have an account?{" "}
                  <Link href="/customer/register" className="font-semibold text-[#0A4D8C] hover:text-[#083a6b]">
                    Create one now
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
