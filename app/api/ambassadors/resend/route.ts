import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmail } from "@/lib/resend";
import { buildAmbassadorWelcomeEmailHtml } from "@/lib/ambassadorEmail";
import { jsonError } from "@/lib/apiResponse";

export async function POST(req: NextRequest) {
  const response = NextResponse.next();
  const { authorized, error } = await requireAdminUser(req, response);
  if (!authorized) return jsonError(error || "Unauthorized", 401);

  try {
    const body = (await req.json()) as { email?: string; temporaryPassword?: string };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const temporaryPassword = typeof body.temporaryPassword === "string" ? body.temporaryPassword.trim() : undefined;

    if (!email) return jsonError("Email is required", 400);

    const { data: ambassador, error: fetchError } = await supabaseAdmin
      .from("ambassadors")
      .select("full_name, referral_code")
      .eq("email", email)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!ambassador) return jsonError("Ambassador account not found", 404);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://travelwithhawkins.com";
    const html = buildAmbassadorWelcomeEmailHtml({
      ambassadorName: String(ambassador.full_name || email),
      email,
      loginUrl: appUrl,
      referralCode: String(ambassador.referral_code || ""),
      referralLink: `${appUrl.replace(/\/$/, "")}/book?ref=${encodeURIComponent(String(ambassador.referral_code || ""))}`,
      temporaryPassword,
    });

    await sendEmail({
      to: email,
      subject: "Welcome to Travel with Hawkins",
      html,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to resend welcome email", 500);
  }
}
