"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

const RESEND_COOLDOWN_SECONDS = 30;

export default function CustomerVerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#0A4D8C] to-[#0f3f78]">
          <div className="text-white">Loading...</div>
        </div>
      }
    >
      <CustomerVerifyEmailContent />
    </Suspense>
  );
}

function CustomerVerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailFromQuery = searchParams.get("email") || "";
  const initialChannel = searchParams.get("channel") === "sms" ? "sms" : "email";

  const [email, setEmail] = useState(emailFromQuery);
  const [activeChannel, setActiveChannel] = useState<"email" | "sms">(initialChannel);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((value) => value - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleVerify = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");
    setLoading(true);

    try {
      const response = await fetch("/api/customers/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });

      const result = await response.json();

      if (!result.success) {
        setError(result.error || "Verification failed");
        setLoading(false);
        return;
      }

      setSuccessMessage("Email verified! Redirecting to login...");
      setTimeout(() => {
        router.push("/customer/login?verified=true");
      }, 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setLoading(false);
    }
  };

  const handleResend = async (channel: "email" | "sms" = activeChannel) => {
    if (!email) {
      setError("Please enter your email address");
      return;
    }

    setError("");
    setSuccessMessage("");
    setResending(true);

    try {
      const response = await fetch("/api/customers/resend-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, channel }),
      });

      const result = await response.json();

      if (!result.success) {
        setError(result.error || "Failed to resend code");
        return;
      }

      setActiveChannel(channel);
      setSuccessMessage(channel === "sms" ? "A new verification code has been sent to your phone." : "A new verification code has been sent to your email.");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A4D8C] to-[#0f3f78] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[80vh] max-w-md items-center justify-center">
        <div className="w-full rounded-[28px] border border-white/20 bg-white p-6 shadow-2xl sm:p-8">
          <Link href="/" className="mb-6 inline-flex items-center gap-3">
            <Image src="/logo.png" width={40} height={40} className="rounded-full object-cover" alt="Travel with Hawkins logo" />
            <span className="text-lg font-black text-[#0A4D8C]">Travel with Hawkins</span>
          </Link>

          <div className="mb-6 text-center">
            <h2 className="text-2xl font-black text-slate-900">Verify your account</h2>
            <p className="mt-2 text-sm text-slate-600">
              We sent a 6-digit code to your {activeChannel === "sms" ? "phone number" : "email address"}. Enter it below to activate your account.
            </p>
          </div>

          {error && (
            <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
          )}

          {successMessage && (
            <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
              {successMessage}
            </div>
          )}

          <form onSubmit={handleVerify} className="space-y-5">
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
              <label htmlFor="code" className="mb-2 block text-sm font-semibold text-slate-700">
                Verification Code
              </label>
              <input
                id="code"
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                required
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-center text-2xl font-black tracking-[0.5em] outline-none transition focus:border-[#0A4D8C] focus:ring-4 focus:ring-[#0A4D8C]/10"
              />
            </div>

            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="w-full rounded-2xl bg-[#0A4D8C] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#083a6b] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Verifying..." : "Verify Email"}
            </button>
          </form>

          <div className="mt-6 flex flex-col items-center gap-2 text-center">
            <button
              type="button"
              onClick={() => handleResend()}
              disabled={resending || cooldown > 0}
              className="text-sm font-semibold text-[#0A4D8C] hover:text-[#083a6b] disabled:cursor-not-allowed disabled:text-slate-400"
            >
              {cooldown > 0 ? `Resend code in ${cooldown}s` : resending ? "Resending..." : "Didn't get a code? Resend"}
            </button>
            <button
              type="button"
              onClick={() => handleResend(activeChannel === "sms" ? "email" : "sms")}
              disabled={resending || cooldown > 0}
              className="text-xs font-semibold text-slate-500 hover:text-slate-700 disabled:cursor-not-allowed disabled:text-slate-300"
            >
              {activeChannel === "sms" ? "Send code via email instead" : "Send code via SMS instead"}
            </button>
          </div>

          <div className="mt-6 text-center">
            <p className="text-sm text-slate-600">
              Already verified?{" "}
              <Link href="/customer/login" className="font-semibold text-[#0A4D8C] hover:text-[#083a6b]">
                Sign in here
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
