import { supabase } from "@/lib/auth";

// ================= TYPES =================

export type CustomerRegistrationData = {
  email: string;
  password: string;
  confirmPassword: string;
  fullName: string;
  phone: string;
  customerType: "student" | "public_traveler" | "corporate";
  studentId?: string;
  university?: string;
  faculty?: string;
  programme?: string;
  yearOfStudy?: number;
  otpChannel?: "email" | "sms";
};

export type CustomerLoginData = {
  email: string;
  password: string;
};

export type CustomerProfile = {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  profilePictureUrl?: string;
  customerType: string;
  customerNumber: string;
  emailVerified: boolean;
  accountStatus: string;
  studentId?: string;
  university?: string;
  faculty?: string;
  programme?: string;
  yearOfStudy?: number;
  preferredRoute?: string;
  preferredPickupPoint?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  createdAt: string;
  lastLogin?: string;
};

// ================= GOOGLE OAUTH =================

export async function signInWithGoogle(): Promise<{ success: boolean; error?: string }> {
  try {
    const appUrl = typeof window !== "undefined" ? window.location.origin : process.env.NEXT_PUBLIC_APP_URL || "https://travelwithhawkins.com";

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${appUrl}/auth/callback`,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error("Google sign in error", error);
    return { success: false, error: error instanceof Error ? error.message : "Google sign in failed" };
  }
}

// ================= PASSWORD RESET =================

export async function requestPasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
  try {
    const appUrl = typeof window !== "undefined" ? window.location.origin : process.env.NEXT_PUBLIC_APP_URL || "https://travelwithhawkins.com";

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${appUrl}/reset-password`,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error("Password reset request error", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to send reset email" };
  }
}

// resetPassword()/changePassword() used to live here, operating on the
// module-level `supabase` client from lib/auth.ts. On the server that
// client is a single instance shared across every request the process
// handles — calling signInWithPassword()/updateUser() on it meant one
// request's session could leak into another's. app/api/customers/password
// now does both operations itself, scoped to the caller's own verified
// user id via a per-request client and the service-role admin API.
