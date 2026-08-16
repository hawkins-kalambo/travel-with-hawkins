"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/auth";

// Only accept an internal, relative path — "//evil.com" (protocol-relative)
// and "https://evil.com" are both rejected, since router.push() would
// otherwise happily navigate a signed-in user off-site to whatever "next"
// value the OAuth callback URL was crafted with.
function sanitizeNextPath(next: string | null): string {
  if (!next) return "/customer/dashboard";
  if (!next.startsWith("/") || next.startsWith("//")) return "/customer/dashboard";
  return next;
}

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Exchange the code for a session
        const code = searchParams.get("code");
        const next = sanitizeNextPath(searchParams.get("next"));

        if (code) {
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

          if (exchangeError) {
            throw exchangeError;
          }

          if (!data.user) {
            throw new Error("No user returned from authentication");
          }

          // customer_profiles/preferences/settings used to be created right
          // here, client-side, with the anon-key session — but RLS has no
          // INSERT policy for customer_profiles, so that insert silently
          // failed and every Google sign-in was left with no profile row at
          // all. GET /api/customers/profile now self-heals this server-side
          // (service role, bypasses RLS) on the very next request, which
          // happens automatically once the dashboard below loads — see
          // ensureCustomerProfileExists in lib/customerAuthAdmin.ts.
          router.push(next);
        } else {
          const error_description = searchParams.get("error_description");
          const error_code = searchParams.get("error");
          setError(error_description || error_code || "Authentication failed. Please try again.");
          setLoading(false);
        }
      } catch (err) {
        console.error("Auth callback error:", err);
        setError(err instanceof Error ? err.message : "An error occurred during authentication");
        setLoading(false);
      }
    };

    handleCallback();
  }, [router, searchParams]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-[#0A4D8C] mx-auto"></div>
          <p className="text-slate-600">Completing sign in...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="mb-4 font-bold text-red-900">Authentication Error</p>
          <p className="mb-6 text-sm text-red-700">{error}</p>
          <a
            href="/customer/login"
            className="inline-block rounded-2xl bg-[#0A4D8C] px-6 py-3 text-sm font-semibold text-white hover:bg-[#083a6b]"
          >
            Try Again
          </a>
        </div>
      </div>
    );
  }

  return null;
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-slate-50"><div className="text-center"><p className="text-slate-600">Loading...</p></div></div>}>
      <AuthCallbackContent />
    </Suspense>
  );
}
