import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuthenticatedUser, resolveAdminRole } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hasPermission, normalizeAppRole } from "@/lib/permissions";
import { attachBookingPaymentStatus } from "@/lib/bookingPaymentStatus";
import { requireUniversityOperationsUser } from "@/lib/universityAdminAuth";
import { jsonError } from "@/lib/apiResponse";

export async function GET(req: NextRequest) {
  const response = NextResponse.next();
  const { user, error } = await requireAuthenticatedUser(req, response);
  if (error || !user) return jsonError("Unauthorized", 401);

  const emailLower = typeof user.email === "string" ? user.email.trim().toLowerCase() : "";

  let profileData = null as { id: string; role?: string } | null;
  const { data, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    const isMissingProfilesTable =
      typeof profileError.message === "string" &&
      profileError.message.includes("Could not find the table 'public.profiles' in the schema cache");

    if (!isMissingProfilesTable) {
      return jsonError(profileError.message || "Unable to load profile", 500);
    }
  } else {
    profileData = data;
  }

  // Resolved server-side from the admins/ambassadors/profiles tables — never
  // from user.user_metadata, which the token owner can set themselves.
  const normalizedRole = normalizeAppRole(profileData?.role ?? (await resolveAdminRole(user)));
  const isAdmin = hasPermission(normalizedRole, "manageReferrals");

  const query = supabaseAdmin.from("referrals").select("*, ambassadors(id, full_name, referral_code)").order("created_at", { ascending: false });

  if (isAdmin) {
    const { data, error: fetchError } = await query;
    if (fetchError) return jsonError(fetchError.message || "Unable to load referrals", 500);
    const withPaymentStatus = await attachBookingPaymentStatus((data ?? []) as Array<Record<string, unknown>>);
    return NextResponse.json({ success: true, referrals: withPaymentStatus });
  }

  if (normalizedRole === "university_admin") {
    const access = await requireUniversityOperationsUser(req, response, "viewReferrals");
    if (!access.authorized) return jsonError(access.error, access.status);
    const { data, error: fetchError } = await query.in("university_id", access.universityIds);
    if (fetchError) return jsonError(fetchError.message || "Unable to load referrals", 500);
    const withPaymentStatus = await attachBookingPaymentStatus((data ?? []) as Array<Record<string, unknown>>);
    return NextResponse.json({ success: true, referrals: withPaymentStatus });
  }

  if (profileData?.role === "ambassador") {
    // Fixes AMB-013 from docs/ambassador-system-audit.md: resolve the
    // caller's own ambassador row from their verified session id first
    // (the same reliable pattern lib/supabaseServer.ts already uses for
    // role resolution), falling back to email only for legacy rows that
    // predate user_id being populated. The previous full_name string-match
    // fallback is removed entirely — two ambassadors sharing a common name
    // could otherwise have their referral lists cross-resolved.
    let ambassadorId: string | undefined;

    // ambassadors.profile_id does not exist on the live table — only
    // user_id (see db/migrations/2026_08_01_declare_ambassadors_user_id.sql).
    // Referencing it here would error the query outright, not just miss.
    const { data: ambassadorByUserId } = await supabaseAdmin
      .from("ambassadors")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    ambassadorId = ambassadorByUserId?.id;

    if (!ambassadorId && emailLower) {
      const { data: ambassadorByEmail } = await supabaseAdmin
        .from("ambassadors")
        .select("id")
        .eq("email", emailLower)
        .maybeSingle();
      ambassadorId = ambassadorByEmail?.id;
    }

    if (!ambassadorId) {
      return NextResponse.json({ success: true, referrals: [] });
    }

    const { data, error: fetchError } = await query.eq("ambassador_id", ambassadorId);
    if (fetchError) return jsonError(fetchError.message || "Unable to load referrals", 500);
    const withPaymentStatus = await attachBookingPaymentStatus((data ?? []) as Array<Record<string, unknown>>);
    return NextResponse.json({ success: true, referrals: withPaymentStatus });
  }

  return NextResponse.json({ success: true, referrals: [] });
}

export async function DELETE(req: NextRequest) {
  const response = NextResponse.next();
  const { user, error } = await requireAuthenticatedUser(req, response);
  if (error || !user) return jsonError("Unauthorized", 401);

  // Check if user is admin
  let profileData = null as { id: string; role?: string } | null;
  const { data, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    const isMissingProfilesTable =
      typeof profileError.message === "string" &&
      profileError.message.includes("Could not find the table 'public.profiles' in the schema cache");

    if (!isMissingProfilesTable) {
      return jsonError(profileError.message || "Unable to load profile", 500);
    }
  } else {
    profileData = data;
  }

  // Resolved server-side from the admins/ambassadors/profiles tables — never
  // from user.user_metadata, which the token owner can set themselves.
  const normalizedRole = normalizeAppRole(profileData?.role ?? (await resolveAdminRole(user)));
  const isAdmin = hasPermission(normalizedRole, "manageReferrals");

  if (!isAdmin) {
    return jsonError("Only admins can delete referrals", 403);
  }

  try {
    const body = await req.json();
    const { referralId } = body as { referralId?: string };

    if (!referralId) {
      return jsonError("referralId is required", 400);
    }

    console.log("[DELETE /api/referrals] Deleting referral:", referralId);

    const { error: deleteError } = await supabaseAdmin.from("referrals").delete().eq("id", referralId);

    if (deleteError) {
      console.error("[DELETE /api/referrals] Supabase error:", deleteError);
      return jsonError(deleteError.message || "Unable to delete referral", 500);
    }

    console.log("[DELETE /api/referrals] Referral deleted successfully");
    return NextResponse.json({ success: true, message: "Referral deleted successfully" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete referral";
    console.error("[DELETE /api/referrals] Error:", message);
    return jsonError(message, 500);
  }
}
