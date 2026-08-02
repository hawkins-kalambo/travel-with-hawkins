import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { publishCommunicationEvent } from "@/lib/communicationEngine";
import { attachBookingPaymentStatus } from "@/lib/bookingPaymentStatus";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function GET(req: NextRequest) {
  const response = NextResponse.next();
  const { authorized, error } = await requireAdminUser(req, response);
  if (!authorized) return jsonError(error || "Unauthorized", 401);

  const { data, error: fetchError } = await supabaseAdmin
    .from("referrals")
    .select("*, ambassadors(id, full_name, referral_code)")
    .order("created_at", { ascending: false });

  if (fetchError) return jsonError(fetchError.message || "Unable to load commissions", 500);
  const withPaymentStatus = await attachBookingPaymentStatus((data ?? []) as Array<Record<string, unknown>>);
  return NextResponse.json({ success: true, referrals: withPaymentStatus });
}

export async function PATCH(req: NextRequest) {
  const response = NextResponse.next();
  const { authorized, user, error } = await requireAdminUser(req, response);
  if (!authorized) return jsonError(error || "Unauthorized", 401);

  try {
    const body = await req.json();
    const referralId = typeof body.referralId === "string" ? body.referralId : "";
    const commissionStatus = typeof body.commissionStatus === "string" ? body.commissionStatus : "";

    console.log("[PATCH /api/commissions] Received request:", { referralId, commissionStatus });

    if (!referralId || !commissionStatus) {
      console.log("[PATCH /api/commissions] Validation failed: missing referralId or commissionStatus");
      return jsonError("referralId and commissionStatus are required", 400);
    }

    console.log("[PATCH /api/commissions] Updating referral in DB...");

    const { data, error } = await supabaseAdmin
      .from("referrals")
      .update({ commission_status: commissionStatus })
      .eq("id", referralId)
      .select()
      .single();

    if (error) {
      console.error("[PATCH /api/commissions] Supabase error:", error);
      throw error;
    }

    console.log("[PATCH /api/commissions] Update successful. Updated referral:", data);

    // Create notification for the ambassador about commission status change.
    //
    // Fixes a bug found while auditing the communications system: this
    // previously passed only `ambassador_id` (the `ambassadors.id`
    // surrogate key) as the event payload's identifier. lib/communicationEngine.ts
    // falls back to using that as the notification's `profile_id` when no
    // explicit `profile_id` is given — but `ambassadors.id` is never equal
    // to a `profiles.id`/auth user id, so every commission_approved/
    // commission_paid notification was silently written under a
    // `profile_id` no session would ever match, and no ambassador ever saw
    // it. Resolving the ambassador's real `user_id` here and passing it
    // explicitly as `profile_id` fixes that.
    const referral = data as Record<string, unknown> | null;
    if (referral && referral.ambassador_id) {
      const ambassadorId = String(referral.ambassador_id);
      const commissionAmount = Number(referral.commission_amount ?? 0);

      const { data: ambassadorRow } = await supabaseAdmin
        .from("ambassadors")
        .select("user_id, profile_id")
        .eq("id", ambassadorId)
        .maybeSingle();
      const ambassadorProfileId = ambassadorRow?.user_id ?? ambassadorRow?.profile_id ?? undefined;

      if (commissionStatus === "approved") {
        await publishCommunicationEvent({
          type: "commission_approved",
          actor_id: user?.id ?? undefined,
          payload: {
            profile_id: ambassadorProfileId,
            ambassador_id: ambassadorId,
            commission_amount: commissionAmount,
            referral_id: referralId,
            booking_id: String(referral.booking_id || ""),
          },
        });
      } else if (commissionStatus === "paid") {
        await publishCommunicationEvent({
          type: "commission_paid",
          actor_id: user?.id ?? undefined,
          payload: {
            profile_id: ambassadorProfileId,
            ambassador_id: ambassadorId,
            commission_amount: commissionAmount,
            referral_id: referralId,
            booking_id: String(referral.booking_id || ""),
          },
        });
      }
    }

    return NextResponse.json({ success: true, referral: data });
  } catch (error) {
    console.error("[PATCH /api/commissions] Caught error:", error);
    return jsonError(error instanceof Error ? error.message : "Unable to update commission", 500);
  }
}
