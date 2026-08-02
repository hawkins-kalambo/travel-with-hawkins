import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { logAmbassadorActivity } from "@/lib/ambassadorActivity";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function getColumnName(value: string | undefined): string | undefined {
  if (!value || !value.trim()) return undefined;
  return value.trim();
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

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const response = NextResponse.next();
  const { authorized, error } = await requireAdminUser(req, response);
  if (!authorized) return jsonError(error || "Unauthorized", 401);

  const { id } = await params;

  try {
    const { data: ambassador, error: ambassadorError } = await supabaseAdmin
      .from("ambassadors")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (ambassadorError) throw ambassadorError;
    if (!ambassador) return jsonError("Ambassador not found", 404);

    const [referralsResult, bookingsResult, activityResult] = await Promise.all([
      supabaseAdmin
        .from("referrals")
        .select("id, commission_amount, commission_status, created_at, booking_id")
        .eq("ambassador_id", id),
      supabaseAdmin
        .from("bookings")
        .select("id, customer_name, customer_phone, route, travel_date, fare, commission_amount, payment_status, created_at")
        .eq("ambassador_id", id)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("ambassador_activity_logs")
        .select("id, activity_type, description, created_at")
        .eq("ambassador_id", id)
        .order("created_at", { ascending: false }),
    ]);

    const referrals = referralsResult.data ?? [];
    const bookings = bookingsResult.data ?? [];
    const activity = activityResult.data ?? [];

    const totalCommission = referrals.reduce((sum, referral) => sum + Number(referral.commission_amount || 0), 0);
    const pendingCommission = referrals
      .filter((referral) => String(referral.commission_status || "").toLowerCase() === "pending")
      .reduce((sum, referral) => sum + Number(referral.commission_amount || 0), 0);
    const approvedCommission = referrals
      .filter((referral) => String(referral.commission_status || "").toLowerCase() === "approved")
      .reduce((sum, referral) => sum + Number(referral.commission_amount || 0), 0);
    const paidCommission = referrals
      .filter((referral) => String(referral.commission_status || "").toLowerCase() === "paid")
      .reduce((sum, referral) => sum + Number(referral.commission_amount || 0), 0);

    const successfulBookings = bookings.filter((booking) => {
      const status = String(booking.payment_status || "").toLowerCase();
      return status === "completed" || status === "confirmed" || status === "payment confirmed";
    }).length;

    const stats = {
      totalReferrals: referrals.length,
      totalApplicationsReferred: referrals.length,
      successfulBookings,
      conversionRate: referrals.length ? Math.round((successfulBookings / referrals.length) * 100) : 0,
      totalCommission,
      pendingCommission,
      approvedCommission,
      paidCommission,
      bookings,
      activity,
    };

    return NextResponse.json({ success: true, ambassador, stats });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to load ambassador details", 500);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const response = NextResponse.next();
  const { authorized, error } = await requireAdminUser(req, response);
  if (!authorized) return jsonError(error || "Unauthorized", 401);

  const { id } = await params;

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    const phone = getColumnName(typeof body.phone === "string" ? body.phone : undefined);
    const email = getColumnName(typeof body.email === "string" ? body.email : undefined)?.toLowerCase();
    const university = getColumnName(typeof body.university === "string" ? body.university : undefined);
    const faculty = getColumnName(typeof body.faculty === "string" ? body.faculty : undefined);
    const program = getColumnName(typeof body.program === "string" ? body.program : undefined);
    const whatsappNumber = getColumnName(typeof body.whatsapp_number === "string" ? body.whatsapp_number : undefined);
    const studentId = getColumnName(typeof body.student_id === "string" ? body.student_id : undefined);
    const status = getColumnName(typeof body.status === "string" ? body.status : undefined);
    const suspensionReason = getColumnName(typeof body.suspension_reason === "string" ? body.suspension_reason : undefined);
    const profileImageBase64 = typeof body.profileImageBase64 === "string" ? body.profileImageBase64 : undefined;
    const profileImageUrl = getColumnName(typeof body.profile_image_url === "string" ? body.profile_image_url : undefined);
    const isVerified = typeof body.is_verified === "boolean" ? body.is_verified : undefined;

    let resolvedImageUrl = profileImageUrl;
    if (profileImageBase64) {
      resolvedImageUrl = (await uploadProfileImage(profileImageBase64)) ?? resolvedImageUrl;
    }

    if (phone) updatePayload.phone = phone;
    if (email) updatePayload.email = email;
    if (university) updatePayload.university = university;
    if (faculty) updatePayload.faculty = faculty;
    if (program) updatePayload.program = program;
    if (whatsappNumber) updatePayload.whatsapp_number = whatsappNumber;
    if (studentId) updatePayload.student_id = studentId;
    if (status) updatePayload.status = status;
    if (suspensionReason !== undefined) updatePayload.suspension_reason = suspensionReason;
    if (resolvedImageUrl !== undefined) updatePayload.profile_image_url = resolvedImageUrl;
    if (isVerified !== undefined) updatePayload.is_verified = isVerified;

    if (Object.keys(updatePayload).length === 1) {
      return jsonError("No changes were provided", 400);
    }

    const { data, error: updateError } = await supabaseAdmin
      .from("ambassadors")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (updateError) throw updateError;

    await logAmbassadorActivity({
      ambassadorId: id,
      activityType: isVerified !== undefined ? "verification_changed" : status ? "status_changed" : "profile_updated",
      description:
        isVerified !== undefined
          ? isVerified
            ? "Admin verified this ambassador based on performance"
            : "Admin removed verified status from this ambassador"
          : status
            ? `Admin updated ambassador status to ${status}`
            : "Admin updated ambassador profile details",
    });

    return NextResponse.json({ success: true, ambassador: data });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to update ambassador", 500);
  }
}
