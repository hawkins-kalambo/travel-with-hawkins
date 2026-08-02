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

export async function resetPassword(newPassword: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (newPassword.length < 8) {
      return { success: false, error: "Password must be at least 8 characters long" };
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error("Password reset error", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to reset password" };
  }
}

export async function changePassword(oldPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: (await supabase.auth.getUser()).data.user?.email || "",
      password: oldPassword,
    });

    if (authError || !authData.session) {
      return { success: false, error: "Current password is incorrect" };
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    return { success: true };
  } catch (error) {
    console.error("Change password error", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to change password" };
  }
}
