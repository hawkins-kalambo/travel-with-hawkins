"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/auth";

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
        const next = searchParams.get("next") || "/customer/dashboard";

        if (code) {
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

          if (exchangeError) {
            throw exchangeError;
          }

          if (!data.user) {
            throw new Error("No user returned from authentication");
          }

          // Check if customer profile needs to be created
          const { data: profileData } = await supabase
            .from("customer_profiles")
            .select("id")
            .eq("id", data.user.id)
            .maybeSingle();

          if (!profileData) {
            // Create customer profile for OAuth user
            const fullName = data.user.user_metadata?.full_name || data.user.email?.split("@")[0] || "User";
            const phone = data.user.user_metadata?.phone || "";

            await supabase.from("customer_profiles").insert([
              {
                id: data.user.id,
                full_name: fullName,
                email: data.user.email,
                phone: phone,
                customer_type: "public_traveler",
                customer_number: `CUST-${new Date().toISOString().split("T")[0].replace(/-/g, "")}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
                email_verified: Boolean(data.user.email_confirmed_at),
                account_status: "active",
              },
            ]);

            // Create default preferences
            await supabase.from("customer_preferences").insert([
              {
                customer_id: data.user.id,
              },
            ]);

            // Create default settings
            await supabase.from("customer_settings").insert([
              {
                customer_id: data.user.id,
              },
            ]);

            // Try to link guest bookings
            const email = data.user.email;
            if (email) {
              await supabase.rpc("link_guest_bookings_to_customer", {
                p_customer_id: data.user.id,
                p_email: email.toLowerCase(),
              });
            }
          }

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
