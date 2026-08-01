import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { CustomerProfile, CustomerRegistrationData, CustomerLoginData } from "@/lib/customerAuth";

// ================= CUSTOMER REGISTRATION =================

export async function registerCustomer(data: CustomerRegistrationData): Promise<{ success: boolean; userId?: string; error?: string }> {
  try {
    // Validate passwords match
    if (data.password !== data.confirmPassword) {
      return { success: false, error: "Passwords do not match" };
    }

    // Validate password strength (minimum 8 characters)
    if (data.password.length < 8) {
      return { success: false, error: "Password must be at least 8 characters long" };
    }

    // Create Supabase auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: data.email.trim().toLowerCase(),
      password: data.password,
      options: {
        data: {
          full_name: data.fullName,
          phone: data.phone,
          customer_type: data.customerType,
          role: "customer",
        },
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

    return { success: true, userId };
  } catch (error) {
    console.error("Registration error", error);
    return { success: false, error: error instanceof Error ? error.message : "Registration failed" };
  }
}

// ================= CUSTOMER LOGIN =================

export async function loginCustomer(
  data: CustomerLoginData,
  supabaseClient: SupabaseClient
): Promise<{ success: boolean; userId?: string; error?: string }> {
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
    const { data, error } = await supabaseAdmin
      .from("customer_preferences")
      .update({
        ...preferences,
        updated_at: new Date().toISOString(),
      })
      .eq("customer_id", customerId)
      .select()
      .maybeSingle();

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
    const { data, error } = await supabaseAdmin
      .from("customer_settings")
      .update({
        ...settings,
        updated_at: new Date().toISOString(),
      })
      .eq("customer_id", customerId)
      .select()
      .maybeSingle();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, settings: data };
  } catch (error) {
    console.error("Update settings error", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to update settings" };
  }
}
