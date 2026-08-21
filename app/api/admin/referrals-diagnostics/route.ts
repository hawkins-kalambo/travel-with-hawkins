import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { jsonError } from "@/lib/apiResponse";

export async function GET(req: NextRequest) {
  const response = NextResponse.next();
  const { authorized, error } = await requireAdminUser(req, response);
  if (!authorized) return jsonError(error || "Unauthorized", 401);

  try {
    const [{ data: ambassadors }, { data: referrals }, { data: bookings }] = await Promise.all([
      // ambassadors.profile_id does not exist on the live table — only
      // user_id (see db/migrations/2026_08_01_declare_ambassadors_user_id.sql).
      // Selecting it here errored the whole query, silently returning 0
      // ambassadors from this diagnostic instead of the real count.
      supabaseAdmin.from("ambassadors").select("id, user_id, full_name, referral_code, status"),
      supabaseAdmin
        .from("referrals")
        .select("id, booking_id, ambassador_id, customer_name, customer_phone, commission_amount, commission_status, created_at"),
      supabaseAdmin
        .from("bookings")
        .select("id, studentName:student_name, studentPhone:student_phone, referral_code, ambassador_id, route, travel_date, created_at")
        .limit(500),
    ]);

    const ambRows = Array.isArray(ambassadors) ? ambassadors : [];
    const refRows = Array.isArray(referrals) ? referrals : [];
    const bookRows = Array.isArray(bookings) ? bookings : [];

    const referralsWithoutAmbassador = refRows.filter((r) => !r.ambassador_id).slice(0, 100);
    const referralsWithMissingAmbassador = refRows.filter((r) => r.ambassador_id && !ambRows.find((a) => a.id === r.ambassador_id)).slice(0, 100);
    const bookingsWithReferral = bookRows.filter((b) => b.referral_code || b.ambassador_id).slice(0, 200);
    const bookingsWithNoReferralRecord = bookingsWithReferral.filter((b) => !refRows.find((r) => r.booking_id === b.id)).slice(0, 200);
    const ambassadorsWithNoReferrals = ambRows.filter((a) => !refRows.find((r) => r.ambassador_id === a.id)).slice(0, 200);

    return NextResponse.json({
      success: true,
      counts: {
        ambassadors: ambRows.length,
        referrals: refRows.length,
        bookings_sampled: bookRows.length,
        bookings_with_referral: bookingsWithReferral.length,
      },
      samples: {
        referralsWithoutAmbassador,
        referralsWithMissingAmbassador,
        bookingsWithReferral: bookingsWithReferral.slice(0, 50),
        bookingsWithNoReferralRecord: bookingsWithNoReferralRecord.slice(0, 50),
        ambassadorsWithNoReferrals: ambassadorsWithNoReferrals.slice(0, 50),
      },
    });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : String(err), 500);
  }
}
