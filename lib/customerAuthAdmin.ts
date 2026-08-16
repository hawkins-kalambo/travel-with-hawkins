import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateAndSendOtp, type OtpChannel } from "@/lib/customerOtp";
import type { CustomerProfile, CustomerRegistrationData, CustomerLoginData } from "@/lib/customerAuth";

// ================= CUSTOMER REGISTRATION =================

export async function registerCustomer(data: CustomerRegistrationData): Promise<{ success: boolean; userId?: string; error?: string; otpSent?: boolean; otpError?: string }> {
  try {
    // Validate passwords match
    if (data.password !== data.confirmPassword) {
      return { success: false, error: "Passwords do not match" };
    }

    // Validate password strength (minimum 8 characters)
    if (data.password.length < 8) {
      return { success: false, error: "Password must be at least 8 characters long" };
    }

    // Create Supabase auth user via the admin API rather than the public
    // signUp() call. The admin API never triggers Supabase's own
    // confirmation email, so the only verification email a customer gets
    // is our own OTP email below (email_confirm is flipped to true once
    // they verify that code, see lib/customerOtp.ts::verifyOtp).
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email.trim().toLowerCase(),
      password: data.password,
      email_confirm: false,
      user_metadata: {
        full_name: data.fullName,
        phone: data.phone,
        customer_type: data.customerType,
        role: "customer",
      },
    });

    if (authError) {
      return { success: false, error: authError.message };
    }

    if (!authData.user?.id) {
      return { success: false, error: "Failed to create user account" };
    }

    const userId = authData.user.id;

    // Create base profile
    const { error: profileError } = await supabaseAdmin.from("profiles").insert([
      {
        id: userId,
        full_name: data.fullName,
        email: data.email.trim().toLowerCase(),
        phone: data.phone,
        role: "customer",
      },
    ]);

    if (profileError && !profileError.message.includes("duplicate")) {
      console.warn("Profile creation warning", profileError);
    }

    // Generate customer number
    const customerNumber = `CUST-${new Date().toISOString().split("T")[0].replace(/-/g, "")}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    // Create customer profile
    const { error: customerProfileError } = await supabaseAdmin.from("customer_profiles").insert([
      {
        id: userId,
        full_name: data.fullName,
        email: data.email.trim().toLowerCase(),
        phone: data.phone,
        customer_type: data.customerType,
        customer_number: customerNumber,
        student_id: data.studentId || null,
        university: data.university || null,
        faculty: data.faculty || null,
        programme: data.programme || null,
        year_of_study: data.yearOfStudy || null,
        email_verified: false,
        account_status: "active",
      },
    ]);

    if (customerProfileError) {
      console.error("Customer profile creation error", customerProfileError);
      return { success: false, error: "Failed to create customer profile" };
    }

    // Create default preferences
    const { error: preferencesError } = await supabaseAdmin.from("customer_preferences").insert([
      {
        customer_id: userId,
        notify_booking_confirmed: true,
        notify_seat_assigned: true,
        notify_trip_reminder: true,
        notify_trip_completed: true,
        notify_announcements: true,
      },
    ]);

    if (preferencesError) {
      console.warn("Preferences creation warning", preferencesError);
    }

    // Create default settings
    const { error: settingsError } = await supabaseAdmin.from("customer_settings").insert([
      {
        customer_id: userId,
        email_notifications: true,
        newsletter_subscription: true,
        promotional_emails: true,
      },
    ]);

    if (settingsError) {
      console.warn("Settings creation warning", settingsError);
    }

    const otpChannel: OtpChannel = data.otpChannel === "sms" ? "sms" : "email";
    const otpResult = await generateAndSendOtp(userId, data.email, data.fullName, otpChannel, data.phone);
    if (!otpResult.success) {
      console.warn("Failed to send registration OTP", otpResult.error);
    }

    // The account is created either way — the customer can always retry
    // delivery from the verify-email screen's "Resend" button — but the API
    // response needs to say honestly whether a code actually went out so the
    // frontend doesn't tell someone to "check your email" when nothing was
    // sent (e.g. Resend/Africa's Talking credentials missing or the provider
    // request failed).
    return { success: true, userId, otpSent: otpResult.success, otpError: otpResult.error };
  } catch (error) {
    console.error("Registration error", error);
    return { success: false, error: error instanceof Error ? error.message : "Registration failed" };
  }
}

// ================= CUSTOMER LOGIN =================

export async function loginCustomer(
  data: CustomerLoginData,
  supabaseClient: SupabaseClient
): Promise<{ success: boolean; userId?: string; error?: string; code?: string }> {
  try {
    const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
      email: data.email.trim().toLowerCase(),
      password: data.password,
    });

    if (authError) {
      return { success: false, error: authError.message };
    }

    if (!authData.session) {
      return { success: false, error: "No session created" };
    }

    const userId = authData.user?.id;

    if (userId) {
      const { data: customerProfile } = await supabaseAdmin
        .from("customer_profiles")
        .select("email_verified")
        .eq("id", userId)
        .maybeSingle();

      if (customerProfile && !customerProfile.email_verified) {
        await supabaseClient.auth.signOut();
        return {
          success: false,
          error: "Please verify your email before signing in.",
          code: "EMAIL_NOT_VERIFIED",
        };
      }
    }

    // Update last login
    if (userId) {
      const { error: updateError } = await supabaseAdmin
        .from("customer_profiles")
        .update({ last_login: new Date().toISOString() })
        .eq("id", userId);

      if (updateError) {
        console.warn("Failed to update last_login", updateError);
      }
    }

    return { success: true, userId };
  } catch (error) {
    console.error("Login error", error);
    return { success: false, error: error instanceof Error ? error.message : "Login failed" };
  }
}

// ================= GET CUSTOMER PROFILE =================

export async function getCustomerProfile(userId: string): Promise<CustomerProfile | null> {
  try {
    const { data, error } = await supabaseAdmin.from("customer_profiles").select("*").eq("id", userId).maybeSingle();

    if (error) {
      console.warn("Failed to get customer profile", error);
      return null;
    }

    if (!data) {
      return null;
    }

    // Map snake_case to camelCase
    return {
      id: data.id,
      email: data.email,
      fullName: data.full_name,
      phone: data.phone,
      profilePictureUrl: data.profile_picture_url,
      customerType: data.customer_type,
      customerNumber: data.customer_number,
      emailVerified: data.email_verified,
      accountStatus: data.account_status,
      studentId: data.student_id,
      university: data.university,
      faculty: data.faculty,
      programme: data.programme,
      yearOfStudy: data.year_of_study,
      preferredRoute: data.preferred_route,
      preferredPickupPoint: data.preferred_pickup_point,
      emergencyContactName: data.emergency_contact_name,
      emergencyContactPhone: data.emergency_contact_phone,
      createdAt: data.created_at,
      lastLogin: data.last_login,
    };
  } catch (error) {
    console.error("Get customer profile error", error);
    return null;
  }
}

// ================= ENSURE CUSTOMER PROFILE EXISTS (OAuth self-heal) =================

// Google sign-in (app/auth/callback) used to create this row client-side
// with the anon-key browser client — RLS has no INSERT policy for
// customer_profiles, so that insert silently failed (the result was never
// even checked) and every Google-signed-in customer was left permanently
// "Profile not found," unable to load or edit their profile or upload a
// photo. This runs server-side with the service role (bypasses RLS) and is
// called from GET/PUT /api/customers/profile so a customer missing their
// row gets backfilled on the very next request instead of staying broken.
export async function ensureCustomerProfileExists(userId: string): Promise<void> {
  const existing = await supabaseAdmin.from("customer_profiles").select("id, profile_picture_url").eq("id", userId).maybeSingle();
  if (existing.data) {
    // Backfill a Google avatar for a row that was created before the
    // account had one (e.g. picked up manually, or by an earlier version of
    // this self-heal) — gated on the DB value being empty so this never
    // overwrites a picture the customer already uploaded themselves.
    if (!existing.data.profile_picture_url) {
      const { data: authUserData } = await supabaseAdmin.auth.admin.getUserById(userId);
      const avatarUrl = authUserData?.user?.user_metadata?.avatar_url || authUserData?.user?.user_metadata?.picture || null;
      if (avatarUrl) {
        await supabaseAdmin.from("customer_profiles").update({ profile_picture_url: avatarUrl }).eq("id", userId);
      }
    }
    return;
  }

  const { data: authUserData } = await supabaseAdmin.auth.admin.getUserById(userId);
  const user = authUserData?.user;
  if (!user) return;

  const fullName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "User";
  const phone = user.user_metadata?.phone || null;
  const profilePictureUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture || null;
  const customerNumber = `CUST-${new Date().toISOString().split("T")[0].replace(/-/g, "")}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

  // customer_profiles.id is a foreign key into profiles(id) — that base row
  // must exist first, or the insert below fails its FK constraint outright.
  const { data: baseProfile } = await supabaseAdmin.from("profiles").select("id, role").eq("id", userId).maybeSingle();
  // A base profile row that already exists with a non-customer role (admin,
  // operator, ambassador) means this account was never a customer — this
  // self-heal must never manufacture a customer_profiles row for it just
  // because it hit an endpoint that also serves real customers (e.g. an
  // admin browsing the public homepage, which now checks customer status
  // the same way logged-in customers do — see SiteHeader.tsx).
  if (baseProfile && baseProfile.role && baseProfile.role !== "customer") return;
  if (!baseProfile) {
    const { error: baseInsertError } = await supabaseAdmin.from("profiles").insert({
      id: userId,
      full_name: fullName,
      email: user.email,
      phone,
      role: "customer",
    });
    if (baseInsertError && !baseInsertError.message.includes("duplicate")) {
      console.error("Failed to backfill base profiles row for OAuth user", baseInsertError.message);
      return;
    }
  }

  const { error: insertError } = await supabaseAdmin.from("customer_profiles").insert({
    id: userId,
    full_name: fullName,
    email: user.email,
    phone,
    profile_picture_url: profilePictureUrl,
    customer_type: "public_traveler",
    customer_number: customerNumber,
    // Email/password accounts always create their customer_profiles row at
    // registration time (see registerCustomer above) — the only way this
    // backfill path runs at all is a Google session, and Google has already
    // verified the address, so this account never needs our own OTP flow.
    email_verified: true,
    email_verified_at: new Date().toISOString(),
    account_status: "active",
  });

  if (insertError) {
    console.error("Failed to backfill customer_profiles for OAuth user", insertError.message);
    return;
  }

  const { error: preferencesError } = await supabaseAdmin.from("customer_preferences").insert({ customer_id: userId });
  if (preferencesError) console.warn("Failed to backfill customer_preferences for OAuth user", preferencesError.message);

  const { error: settingsError } = await supabaseAdmin.from("customer_settings").insert({ customer_id: userId });
  if (settingsError) console.warn("Failed to backfill customer_settings for OAuth user", settingsError.message);

  if (user.email) {
    await linkGuestBookings(userId, user.email);
  }
}

// ================= UPDATE CUSTOMER PROFILE =================

export async function updateCustomerProfile(
  userId: string,
  updates: Partial<CustomerProfile>
): Promise<{ success: boolean; error?: string; profile?: CustomerProfile }> {
  try {
    // Map camelCase to snake_case
    const snakeCaseUpdates: Record<string, unknown> = {};

    if (updates.fullName) snakeCaseUpdates.full_name = updates.fullName;
    if (updates.phone) snakeCaseUpdates.phone = updates.phone;
    if (updates.profilePictureUrl) snakeCaseUpdates.profile_picture_url = updates.profilePictureUrl;
    if (updates.studentId) snakeCaseUpdates.student_id = updates.studentId;
    if (updates.university) snakeCaseUpdates.university = updates.university;
    if (updates.faculty) snakeCaseUpdates.faculty = updates.faculty;
    if (updates.programme) snakeCaseUpdates.programme = updates.programme;
    if (updates.yearOfStudy) snakeCaseUpdates.year_of_study = updates.yearOfStudy;
    if (updates.preferredRoute) snakeCaseUpdates.preferred_route = updates.preferredRoute;
    if (updates.preferredPickupPoint) snakeCaseUpdates.preferred_pickup_point = updates.preferredPickupPoint;
    if (updates.emergencyContactName) snakeCaseUpdates.emergency_contact_name = updates.emergencyContactName;
    if (updates.emergencyContactPhone) snakeCaseUpdates.emergency_contact_phone = updates.emergencyContactPhone;

    snakeCaseUpdates.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin.from("customer_profiles").update(snakeCaseUpdates).eq("id", userId).select().maybeSingle();

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data) {
      return { success: false, error: "Profile not found" };
    }

    const profile = {
      id: data.id,
      email: data.email,
      fullName: data.full_name,
      phone: data.phone,
      profilePictureUrl: data.profile_picture_url,
      customerType: data.customer_type,
      customerNumber: data.customer_number,
      emailVerified: data.email_verified,
      accountStatus: data.account_status,
      studentId: data.student_id,
      university: data.university,
      faculty: data.faculty,
      programme: data.programme,
      yearOfStudy: data.year_of_study,
      preferredRoute: data.preferred_route,
      preferredPickupPoint: data.preferred_pickup_point,
      emergencyContactName: data.emergency_contact_name,
      emergencyContactPhone: data.emergency_contact_phone,
      createdAt: data.created_at,
      lastLogin: data.last_login,
    };

    return { success: true, profile };
  } catch (error) {
    console.error("Update customer profile error", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to update profile" };
  }
}

// ================= LINK GUEST BOOKINGS =================

export async function linkGuestBookings(customerId: string, email: string): Promise<{ success: boolean; linkedCount?: number; error?: string }> {
  try {
    const { data, error } = await supabaseAdmin.rpc("link_guest_bookings_to_customer", {
      p_customer_id: customerId,
      p_email: email.trim().toLowerCase(),
    });

    if (error) {
      console.warn("Link guest bookings RPC error", error);
      return { success: false, error: error.message };
    }

    if (data && Array.isArray(data) && data.length > 0) {
      const linkedCount = data[0].linked_count || 0;
      return { success: true, linkedCount };
    }

    return { success: true, linkedCount: 0 };
  } catch (error) {
    console.error("Link guest bookings error", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to link guest bookings" };
  }
}

// ================= CHECK EMAIL VERIFICATION =================

export async function verifyCustomerEmail(userId: string): Promise<{ success: boolean; verified?: boolean; error?: string }> {
  try {
    const { data, error } = await supabaseAdmin
      .from("customer_profiles")
      .update({
        email_verified: true,
        email_verified_at: new Date().toISOString(),
      })
      .eq("id", userId)
      .select()
      .maybeSingle();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, verified: data?.email_verified ?? false };
  } catch (error) {
    console.error("Email verification error", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to verify email" };
  }
}

// ================= CUSTOMER PREFERENCES =================

export async function getCustomerPreferences(customerId: string) {
  try {
    const { data, error } = await supabaseAdmin.from("customer_preferences").select("*").eq("customer_id", customerId).maybeSingle();

    if (error) {
      console.warn("Get preferences error", error);
      return null;
    }

    return data;
  } catch (error) {
    console.error("Get preferences error", error);
    return null;
  }
}

export async function updateCustomerPreferences(customerId: string, preferences: Record<string, unknown>) {
  try {
    // UPDATE is a no-op if the customer has no preferences row yet (older
    // accounts predating the default-row insert in registerCustomer(), or
    // one whose insert failed) — fall back to creating the row instead of
    // silently discarding the change.
    const { data: existing, error: selectError } = await supabaseAdmin
      .from("customer_preferences")
      .select("id")
      .eq("customer_id", customerId)
      .maybeSingle();

    if (selectError) {
      return { success: false, error: selectError.message };
    }

    const query = existing
      ? supabaseAdmin
          .from("customer_preferences")
          .update({ ...preferences, updated_at: new Date().toISOString() })
          .eq("customer_id", customerId)
      : supabaseAdmin.from("customer_preferences").insert([{ customer_id: customerId, ...preferences }]);

    const { data, error } = await query.select().maybeSingle();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, preferences: data };
  } catch (error) {
    console.error("Update preferences error", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to update preferences" };
  }
}

// ================= CUSTOMER SETTINGS =================

export async function getCustomerSettings(customerId: string) {
  try {
    const { data, error } = await supabaseAdmin.from("customer_settings").select("*").eq("customer_id", customerId).maybeSingle();

    if (error) {
      console.warn("Get settings error", error);
      return null;
    }

    return data;
  } catch (error) {
    console.error("Get settings error", error);
    return null;
  }
}

export async function updateCustomerSettings(customerId: string, settings: Record<string, unknown>) {
  try {
    // Same upsert fallback as updateCustomerPreferences() above — a plain
    // UPDATE would silently no-op for a customer with no settings row yet.
    const { data: existing, error: selectError } = await supabaseAdmin
      .from("customer_settings")
      .select("id")
      .eq("customer_id", customerId)
      .maybeSingle();

    if (selectError) {
      return { success: false, error: selectError.message };
    }

    const query = existing
      ? supabaseAdmin
          .from("customer_settings")
          .update({ ...settings, updated_at: new Date().toISOString() })
          .eq("customer_id", customerId)
      : supabaseAdmin.from("customer_settings").insert([{ customer_id: customerId, ...settings }]);

    const { data, error } = await query.select().maybeSingle();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, settings: data };
  } catch (error) {
    console.error("Update settings error", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to update settings" };
  }
}
