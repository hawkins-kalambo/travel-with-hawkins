import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { generateAndSendOtp, getCustomerContactByEmail, type OtpChannel } from "@/lib/customerOtp";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

    const { data: customer } = await supabaseAdmin
      .from("customer_profiles")
      .select("email_verified")
      .eq("email", email.trim().toLowerCase())
      .maybeSingle();

    if (customer?.email_verified) {
      return NextResponse.json({ success: true, message: "Email is already verified" });
    }

    const customerInfo = await getCustomerContactByEmail(email);
    if (!customerInfo) {
      return NextResponse.json(
        { success: false, error: "Account not found" },
        { status: 404 }
      );
    }

    if (channel === "sms" && !customerInfo.phone) {
      return NextResponse.json(
        { success: false, error: "No phone number on file for this account" },
        { status: 400 }
      );
    }

    const result = await generateAndSendOtp(customerInfo.id, email, customerInfo.fullName, channel, customerInfo.phone ?? undefined);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Failed to resend verification code" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, message: "Verification code resent" });
  } catch (error) {
    console.error("POST /api/customers/resend-otp error", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to resend verification code" },
      { status: 500 }
    );
  }
}
