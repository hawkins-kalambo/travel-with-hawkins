import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { generateAndSendOtp, getCustomerContactByEmail, type OtpChannel } from "@/lib/customerOtp";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isRateLimited } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/clientIp";

// Deliberately identical for "no such account", "already verified", and
// "code actually sent" — this endpoint is public (a freshly-registered
// customer has no session yet), and previously returned a distinct status
// for each of those three, letting anyone enumerate the customer base and
// each account's verification state. The per-account throttle inside
// generateAndSendOtp() (lib/customerOtp.ts) only kicks in for accounts that
// exist; nothing previously stopped probing many different emails from one
// IP.
const GENERIC_MESSAGE = "If this account exists and needs verification, a code has been sent.";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email } = body;
    const channel: OtpChannel = body.channel === "sms" ? "sms" : "email";

    if (!email) {
      return NextResponse.json(
        { success: false, error: "Missing required field: email" },
        { status: 400 }
      );
    }

    if (await isRateLimited(`otp:resend:ip:${getClientIp(req)}`, 300, 10)) {
      return NextResponse.json(
        { success: false, error: "Too many requests. Please wait a few minutes and try again." },
        { status: 429 }
      );
    }

    const { data: customer } = await supabaseAdmin
      .from("customer_profiles")
      .select("email_verified")
      .eq("email", email.trim().toLowerCase())
      .maybeSingle();

    if (customer?.email_verified) {
      return NextResponse.json({ success: true, message: GENERIC_MESSAGE });
    }

    const customerInfo = await getCustomerContactByEmail(email);
    if (!customerInfo) {
      return NextResponse.json({ success: true, message: GENERIC_MESSAGE });
    }

    if (channel === "sms" && !customerInfo.phone) {
      return NextResponse.json(
        { success: false, error: "No phone number on file for this account" },
        { status: 400 }
      );
    }

    await generateAndSendOtp(customerInfo.id, email, customerInfo.fullName, channel, customerInfo.phone ?? undefined);

    // Same response whether generateAndSendOtp actually sent a code or was
    // itself internally throttled (lib/customerOtp.ts's own per-account
    // limit) — either way the caller can't distinguish "sent" from "this
    // account already got one recently" from "didn't exist".
    return NextResponse.json({ success: true, message: GENERIC_MESSAGE });
  } catch (error) {
    console.error("POST /api/customers/resend-otp error", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to resend verification code" },
      { status: 500 }
    );
  }
}
