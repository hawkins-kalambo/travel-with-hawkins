import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuthenticatedUser } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeAdminRole } from "@/lib/adminAuth";

async function logAmbassadorActivityFallback({ profileId }: { profileId?: string | null }) {
  if (!profileId) return null;

  try {
    const { data, error } = await supabaseAdmin
      .from("ambassadors")
      .select("id")
      .eq("profile_id", profileId)
      .maybeSingle();

    if (error || !data?.id) return null;

    await supabaseAdmin.from("ambassador_activity_logs").insert([
      {
        ambassador_id: data.id,
        activity_type: "profile_updated",
        description: "Profile updated",
      },
    ]);

    return data;
  } catch {
    return null;
  }
}

function jsonError(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

async function uploadProfileImage(base64: string) {
  const matches = base64.match(/^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/);
  if (!matches) return null;

  const mime = matches[1];
  const ext = matches[2] === "png" ? "png" : matches[2] === "webp" ? "webp" : "jpg";
  const path = `ambassadors/${randomUUID()}/profile.${ext}`;
  const buffer = Buffer.from(matches[3], "base64");

  try {
    const { error } = await supabaseAdmin.storage.from("ambassador-profiles").upload(path, buffer, {
      contentType: mime,
      upsert: false,
    });

    if (error) {
      console.warn("Profile image upload skipped", error.message);
      return null;
    }

    const { data: urlData } = await supabaseAdmin.storage.from("ambassador-profiles").getPublicUrl(path);
    return urlData?.publicUrl ?? null;
  } catch (error) {
    console.warn("Profile image upload failed", error);
    return null;
  }
}

export async function GET(req: NextRequest) {
  const response = NextResponse.next();
  const { user, error } = await requireAuthenticatedUser(req, response);

  if (error || !user) {
    return jsonError("Unauthorized", 401);
  }

  const { data, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email, phone, role")
    .eq("id", user.id)
    .maybeSingle();

  const { data: adminRow, error: adminRoleError } = await supabaseAdmin
    .from("admins")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  let ambassadorData: Record<string, unknown> | null = null;
  const { data: ambassadorRow, error: ambassadorError } = await supabaseAdmin
    .from("ambassadors")
    .select("id, profile_id, full_name, student_id, email, phone, whatsapp_number, university, faculty, program, year_of_study, profile_image_url, referral_code, status, is_verified, created_at, last_login")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!ambassadorError) {
    ambassadorData = ambassadorRow as Record<string, unknown> | null;
  }

  if (profileError) {
    const isMissingProfilesTable =
      typeof profileError.message === "string" &&
      profileError.message.includes("Could not find the table 'public.profiles' in the schema cache");

    if (isMissingProfilesTable) {
      const fallbackRole = typeof user.user_metadata?.role === "string" ? user.user_metadata.role : "customer";
      return NextResponse.json({
        success: true,
        profile: {
          id: user.id,
          email: user.email,
          full_name: user.user_metadata?.full_name ?? null,
          phone: user.user_metadata?.phone ?? null,
          role: fallbackRole,
          ...(ambassadorData || {}),
        },
      });
    }

    return jsonError(profileError.message || "Unable to load profile", 500);
  }

  if (adminRoleError) {
    console.warn("Failed to load admin role for profile response", adminRoleError.message);
  }

  const metadataRole = typeof user.user_metadata?.role === "string" ? user.user_metadata.role : undefined;
  const resolvedRole = normalizeAdminRole(
    typeof adminRow?.role === "string" && adminRow.role.trim()
      ? adminRow.role
      : (data?.role ?? metadataRole ?? "customer")
  );

  const mergedProfile = {
    id: data?.id ?? user.id,
    email: data?.email ?? user.email,
    full_name: data?.full_name ?? ambassadorData?.full_name ?? user.user_metadata?.full_name ?? null,
    phone: data?.phone ?? ambassadorData?.phone ?? user.user_metadata?.phone ?? null,
    role: resolvedRole,
    ...(ambassadorData || {}),
  };

  return NextResponse.json({ success: true, profile: mergedProfile });
}

export async function PATCH(req: NextRequest) {
  const response = NextResponse.next();
  const { user, error } = await requireAuthenticatedUser(req, response);

  if (error || !user) {
    return jsonError("Unauthorized", 401);
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const phone = typeof body.phone === "string" && body.phone.trim() ? body.phone.trim() : undefined;
    const whatsappNumber = typeof body.whatsapp_number === "string" && body.whatsapp_number.trim()
      ? body.whatsapp_number.trim()
      : typeof body.whatsapp === "string" && body.whatsapp.trim()
        ? body.whatsapp.trim()
        : undefined;
    const studentId = typeof body.student_id === "string" && body.student_id.trim() ? body.student_id.trim() : undefined;
    const profileImageBase64 = typeof body.profileImageBase64 === "string" ? body.profileImageBase64 : undefined;
    const profileImageUrl = typeof body.profile_image_url === "string" && body.profile_image_url.trim() ? body.profile_image_url.trim() : undefined;
    const shouldUpdateLastLogin = body.last_login === true;

    const profileUpdates: Record<string, unknown> = {};
    const ambassadorUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (phone) {
      profileUpdates.phone = phone;
      ambassadorUpdates.phone = phone;
    }

    if (profileImageBase64) {
      const uploadedUrl = await uploadProfileImage(profileImageBase64);
      if (uploadedUrl) {
        ambassadorUpdates.profile_image_url = uploadedUrl;
      }
    } else if (profileImageUrl) {
      ambassadorUpdates.profile_image_url = profileImageUrl;
    }

    if (whatsappNumber) {
      ambassadorUpdates.whatsapp_number = whatsappNumber;
    }

    if (studentId) {
      ambassadorUpdates.student_id = studentId;
    }

    if (shouldUpdateLastLogin) {
      ambassadorUpdates.last_login = new Date().toISOString();
    }

    if (Object.keys(profileUpdates).length === 0 && Object.keys(ambassadorUpdates).length === 1) {
      return jsonError("No changes were provided", 400);
    }

    if (Object.keys(profileUpdates).length > 0) {
      const { error: profileError } = await supabaseAdmin.from("profiles").update(profileUpdates).eq("id", user.id);
      if (profileError) throw profileError;
    }

    const { data: ambassadorRow, error: ambassadorLookupError } = await supabaseAdmin
      .from("ambassadors")
      .select("id")
      .eq("profile_id", user.id)
      .maybeSingle();

    if (ambassadorLookupError) throw ambassadorLookupError;

    if (ambassadorRow?.id) {
      const { data, error: ambassadorError } = await supabaseAdmin
        .from("ambassadors")
        .update(ambassadorUpdates)
        .eq("id", ambassadorRow.id)
        .select("id, full_name, profile_image_url, phone, whatsapp_number, student_id, referral_code, status, last_login")
        .single();

      if (ambassadorError) throw ambassadorError;
      await logAmbassadorActivityFallback({
        profileId: user.id,
      });
      const profileData = data as Record<string, unknown>;
      const mergedProfile = {
        id: user.id,
        phone,
        whatsapp_number: whatsappNumber,
        ...profileData,
      };
      return NextResponse.json({ success: true, profile: mergedProfile });
    }

    return NextResponse.json({ success: true, profile: { id: user.id, phone, whatsapp_number: whatsappNumber } });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to update profile", 500);
  }
}
