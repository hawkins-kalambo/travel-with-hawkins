import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuthenticatedUser } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { logAmbassadorActivity } from "@/lib/ambassadorActivity";
import { normalizeMalawiPhone } from "@/lib/phoneNumbers";

// Fixes AMB-017 from docs/ambassador-system-audit.md — the ambassador
// profile page (app/ambassador/(protected)/profile/page.tsx) called
// PATCH /api/ambassadors/[id], which is requireAdminUser-gated, so a real
// ambassador editing their own profile always got a 401/403. This route
// gives ambassadors a real, ownership-scoped self-edit path: the caller's
// own ambassador row is resolved from their verified session id
// (never a client-supplied id, same pattern as /api/referrals and
// /api/profile), and only a small whitelist of self-editable fields can be
// changed — referral_code, status, and anything commission-related are
// intentionally not editable here; those stay admin-only via
// PATCH /api/ambassadors/[id].

function jsonError(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

async function resolveOwnAmbassador(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("ambassadors")
    .select("*")
    .or(`user_id.eq.${userId},profile_id.eq.${userId}`)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function uploadProfileImage(base64: string) {
  const matches = base64.match(/^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/);
  if (!matches) return null;

  const mime = matches[1];
  const ext = matches[2] === "png" ? "png" : matches[2] === "webp" ? "webp" : "jpg";
  const path = `ambassadors/${randomUUID()}/profile.${ext}`;
  const buffer = Buffer.from(matches[3], "base64");

  try {
    const { error } = await supabaseAdmin.storage.from("ambassador-profiles").upload(path, buffer, { contentType: mime, upsert: false });
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
  if (error || !user) return jsonError("Unauthorized", 401);

  try {
    const ambassador = await resolveOwnAmbassador(user.id);
    if (!ambassador) return jsonError("No ambassador account found for this user", 404);
    return NextResponse.json({ success: true, ambassador });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Unable to load ambassador profile", 500);
  }
}

export async function PATCH(req: NextRequest) {
  const response = NextResponse.next();
  const { user, error } = await requireAuthenticatedUser(req, response);
  if (error || !user) return jsonError("Unauthorized", 401);

  try {
    const ambassador = await resolveOwnAmbassador(user.id);
    if (!ambassador) return jsonError("No ambassador account found for this user", 404);

    const body = (await req.json()) as Record<string, unknown>;
    const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (typeof body.phone === "string" && body.phone.trim()) {
      const normalizedPhone = normalizeMalawiPhone(body.phone);
      if (!normalizedPhone) return jsonError("Please enter a valid Malawi phone number.", 400);
      updatePayload.phone = normalizedPhone;
    }

    if (typeof body.whatsapp_number === "string") {
      const trimmed = body.whatsapp_number.trim();
      if (trimmed) {
        const normalizedWhatsapp = normalizeMalawiPhone(trimmed);
        if (!normalizedWhatsapp) return jsonError("Please enter a valid Malawi WhatsApp number.", 400);
        updatePayload.whatsapp_number = normalizedWhatsapp;
      } else {
        updatePayload.whatsapp_number = null;
      }
    }

    if (typeof body.profileImageBase64 === "string" && body.profileImageBase64) {
      const uploadedUrl = await uploadProfileImage(body.profileImageBase64);
      if (!uploadedUrl) return jsonError("Unable to process the uploaded photo. Please try a different image.", 400);
      updatePayload.profile_image_url = uploadedUrl;
    }

    if (Object.keys(updatePayload).length === 1) {
      return jsonError("No changes were provided", 400);
    }

    const { data, error: updateError } = await supabaseAdmin
      .from("ambassadors")
      .update(updatePayload)
      .eq("id", ambassador.id)
      .select()
      .single();

    if (updateError) throw updateError;

    await logAmbassadorActivity({
      ambassadorId: ambassador.id,
      profileId: user.id,
      activityType: "profile_updated",
      description: "Ambassador updated their own profile details",
    });

    return NextResponse.json({ success: true, ambassador: data });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Unable to update ambassador profile", 500);
  }
}
