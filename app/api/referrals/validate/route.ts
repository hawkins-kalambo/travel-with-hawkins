import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const referralCode = typeof body.referralCode === "string" ? body.referralCode.trim().toUpperCase() : "";

    if (!referralCode) return jsonError("Referral code is required", 400);

    const { data, error } = await supabaseAdmin
      .from("ambassadors")
      .select("id, full_name, referral_code, status")
      .eq("referral_code", referralCode)
      .maybeSingle();

    if (error) throw error;

    if (!data || data.status !== "active") {
      return NextResponse.json({ success: false, valid: false, message: "Invalid referral code" });
    }

    return NextResponse.json({ success: true, valid: true, ambassador: data });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to validate referral code", 500);
  }
}
