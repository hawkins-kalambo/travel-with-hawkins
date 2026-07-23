import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuthenticatedUser } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function GET(req: NextRequest) {
  const response = NextResponse.next();
  const { user, error } = await requireAuthenticatedUser(req, response);
  if (error || !user) return jsonError("Unauthorized", 401);

  const emailLower = typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
  const profileName = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "";

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

    if (isMissingProfilesTable) {
      const fallbackRole = typeof user.user_metadata?.role === "string" ? user.user_metadata.role : "customer";
      profileData = { id: user.id, role: fallbackRole };
    } else {
      return jsonError(profileError.message || "Unable to load profile", 500);
    }
  } else {
    profileData = data;
  }

  // Determine whether this request should be treated as an admin view.
  const allowedAdminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || process.env.ADMIN_EMAIL;
  const metadataRole = typeof user.user_metadata?.role === "string" ? user.user_metadata.role : undefined;
  const isAdmin = profileData?.role === "admin" || metadataRole === "admin" || (allowedAdminEmail && emailLower && emailLower === String(allowedAdminEmail).trim().toLowerCase());

  const query = supabaseAdmin.from("referrals").select("*, ambassadors(id, full_name, referral_code)").order("created_at", { ascending: false });

  if (isAdmin) {
    console.log("referrals: returning admin view for", emailLower || user.id);
    const { data, error: fetchError } = await query;
    if (fetchError) return jsonError(fetchError.message || "Unable to load referrals", 500);
    return NextResponse.json({ success: true, referrals: data ?? [] });
  }

  if (profileData?.role === "ambassador") {
    let ambassadorId: string | undefined;

    if (emailLower) {
      const { data: ambassadorByEmail } = await supabaseAdmin
        .from("ambassadors")
        .select("id")
        .eq("email", emailLower)
        .maybeSingle();
      ambassadorId = ambassadorByEmail?.id;
    }

    if (!ambassadorId && profileName) {
      const { data: ambassadorByName } = await supabaseAdmin
        .from("ambassadors")
        .select("id")
        .eq("full_name", profileName)
        .maybeSingle();
      ambassadorId = ambassadorByName?.id;
    }

    if (!ambassadorId) {
      return NextResponse.json({ success: true, referrals: [] });
    }

    const { data, error: fetchError } = await query.eq("ambassador_id", ambassadorId);
    if (fetchError) return jsonError(fetchError.message || "Unable to load referrals", 500);
    return NextResponse.json({ success: true, referrals: data ?? [] });
  }

  return NextResponse.json({ success: true, referrals: [] });
}

export async function DELETE(req: NextRequest) {
  const response = NextResponse.next();
  const { user, error } = await requireAuthenticatedUser(req, response);
  if (error || !user) return jsonError("Unauthorized", 401);

  const emailLower = typeof user.email === "string" ? user.email.trim().toLowerCase() : "";

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

    if (isMissingProfilesTable) {
      const fallbackRole = typeof user.user_metadata?.role === "string" ? user.user_metadata.role : "customer";
      profileData = { id: user.id, role: fallbackRole };
    } else {
      return jsonError(profileError.message || "Unable to load profile", 500);
    }
  } else {
    profileData = data;
  }

  // Determine whether this request should be treated as an admin operation
  const allowedAdminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || process.env.ADMIN_EMAIL;
  const metadataRole = typeof user.user_metadata?.role === "string" ? user.user_metadata.role : undefined;
  const isAdmin = profileData?.role === "admin" || metadataRole === "admin" || (allowedAdminEmail && emailLower && emailLower === String(allowedAdminEmail).trim().toLowerCase());

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
