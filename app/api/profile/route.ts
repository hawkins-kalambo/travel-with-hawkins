import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { escapeLikePattern, requireAuthenticatedUser, resolveAdminRole } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeAdminRole } from "@/lib/adminAuth";
import { jsonError } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

async function logAmbassadorActivityFallback({ profileId }: { profileId?: string | null }) {
  if (!profileId) return null;

  try {
    const { data, error } = await supabaseAdmin
      .from("ambassadors")
      .select("id")
      .or(`user_id.eq.${profileId},profile_id.eq.${profileId}`)
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
    console.warn("/api/profile: requireAuthenticatedUser failed", { error });
    return jsonError("Unauthorized", 401);
  }

  console.debug("/api/profile: authenticated user", { id: user.id, email: user.email });

  const { data, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email, phone, role")
    .eq("id", user.id)
    .maybeSingle();

  const resolvedAdminRole = await resolveAdminRole(user);

  let ambassadorData: Record<string, unknown> | null = null;
  const lookupDebug: Record<string, unknown> = {};
  const { data: ambassadorRow, error: ambassadorError } = await supabaseAdmin
    .from("ambassadors")
    .select("id, user_id, profile_id, full_name, student_id, email, phone, whatsapp_number, university, faculty, program, year_of_study, profile_image_url, referral_code, status, is_verified, created_at, last_login")
    .or(`user_id.eq.${user.id},profile_id.eq.${user.id}`)
    .limit(1)
    .maybeSingle();

  lookupDebug.primary = { error: ambassadorError?.message ?? null, found: !!ambassadorRow };

  if (ambassadorError) {
    console.warn("/api/profile: ambassador lookup failed", { userId: user.id, error: ambassadorError });
  } else {
    ambassadorData = ambassadorRow as Record<string, unknown> | null;
  }

  if (!ambassadorData && typeof user.email === "string") {
    const normalizedEmail = user.email.trim().toLowerCase();
    if (normalizedEmail) {
      // Escaped so `_`/`%` in the caller's own email can't wildcard-match
      // (and then get permanently bound to, via the user_id update below) a
      // DIFFERENT ambassador's row.
      const { data: emailAmbassador, error: emailAmbassadorError } = await supabaseAdmin
        .from("ambassadors")
        .select("id, user_id, profile_id, full_name, student_id, email, phone, whatsapp_number, university, faculty, program, year_of_study, profile_image_url, referral_code, status, is_verified, created_at, last_login")
        .ilike("email", escapeLikePattern(normalizedEmail))
        .limit(1)
        .maybeSingle();

      lookupDebug.emailFallback = { normalizedEmail, error: emailAmbassadorError?.message ?? null, found: !!emailAmbassador };

      if (!emailAmbassadorError && emailAmbassador) {
        console.warn("/api/profile: ambassador fallback email lookup succeeded", { userId: user.id, email: normalizedEmail, ambassadorId: emailAmbassador.id });
        ambassadorData = emailAmbassador as Record<string, unknown>;

        // Sync whenever user_id is missing OR stale (pointing at some other,
        // no-longer-current auth id for this same verified email) — not just
        // when it's empty. A stale link previously left the account
        // permanently unhealed: the primary user_id/profile_id lookup above
        // kept missing it, and this fallback only corrected a genuinely
        // empty user_id, never overwrote a wrong one.
        if (emailAmbassador.user_id !== user.id) {
          const { error: syncError } = await supabaseAdmin
            .from("ambassadors")
            .update({ user_id: user.id })
            .eq("id", emailAmbassador.id)
            .limit(1);
          lookupDebug.userIdSync = { attempted: true, error: syncError?.message ?? null };
        }
      } else if (emailAmbassadorError) {
        console.warn("/api/profile: ambassador fallback email lookup failed", { userId: user.id, email: normalizedEmail, error: emailAmbassadorError });
      }
    }
  }

  if (profileError) {
    const isMissingProfilesTable =
      typeof profileError.message === "string" &&
      profileError.message.includes("Could not find the table 'public.profiles' in the schema cache");

    if (isMissingProfilesTable) {
      // Resolved server-side (admins/ambassadors tables) — never from
      // user.user_metadata, which the token owner can set themselves.
      const fallbackRole = ambassadorData ? "ambassador" : resolvedAdminRole || "customer";
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

  const resolvedRole = normalizeAdminRole(resolvedAdminRole || (data?.role ?? "customer"));

  console.debug("/api/profile: role resolution", { resolvedAdminRole, profileRow: data, resolvedRole, ambassadorDataExists: !!ambassadorData });

  const mergedProfile = {
    id: data?.id ?? user.id,
    email: data?.email ?? user.email,
    full_name: data?.full_name ?? ambassadorData?.full_name ?? user.user_metadata?.full_name ?? null,
    phone: data?.phone ?? ambassadorData?.phone ?? user.user_metadata?.phone ?? null,
    role: ambassadorData ? "ambassador" : resolvedRole,
    ...(ambassadorData || {}),
  };

  // Temporary: surfaced only when someone whose profiles.role is literally
  // "ambassador" still failed to resolve an ambassadors row, so the failure
  // mode (which lookup missed, and why) is visible from the response itself
  // without needing direct database access to diagnose.
  const debugPayload = !ambassadorData && data?.role === "ambassador" ? { _ambassadorLookupDebug: lookupDebug } : {};

  return NextResponse.json({ success: true, profile: { ...mergedProfile, ...debugPayload } }, { headers: { "Cache-Control": "no-store" } });
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
    // student_id is intentionally not self-editable — it's the field admins
    // verify identity against during ambassador application review, so it
    // should only ever change through an admin action.
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
      .or(`user_id.eq.${user.id},profile_id.eq.${user.id}`)
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
