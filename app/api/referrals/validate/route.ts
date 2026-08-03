import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isRateLimited } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/clientIp";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(req: NextRequest) {
  try {
    // Public and unauthenticated by design (the booking form needs it for
    // guests), but was previously unthrottled — combined with referral
    // codes that used to be sequential, that let anyone script through
    // every code and harvest ambassador names. Codes are non-sequential
    // now (see lib/ambassadorCode.ts); this rate limit is the other half
    // of closing that off.
    const ip = getClientIp(req);
    if (await isRateLimited(`referrals:validate:${ip}`, 60, 20)) {
      return jsonError("Too many requests. Please wait a moment and try again.", 429);
    }

    const body = (await req.json()) as Record<string, unknown>;
    const referralCode = typeof body.referralCode === "string" ? body.referralCode.trim().toUpperCase() : "";

    if (!referralCode) return jsonError("Referral code is required", 400);

    const { data, error } = await supabaseAdmin
      .from("ambassadors")
      .select("full_name, status")
      .eq("referral_code", referralCode)
      .maybeSingle();

    if (error) throw error;

    if (!data || data.status !== "active") {
      return NextResponse.json({ success: false, valid: false, message: "Invalid referral code" });
    }

    // Only the field the booking form actually displays (the "referred by
    // <name>" confirmation) — no id/referral_code echoed back.
    return NextResponse.json({ success: true, valid: true, ambassador: { full_name: data.full_name } });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to validate referral code", 500);
  }
}
