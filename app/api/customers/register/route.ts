import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { registerCustomer } from "@/lib/customerAuthAdmin";
import { isRateLimited } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/clientIp";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const { email, password, confirmPassword, fullName, phone, customerType, studentId, university, faculty, programme, yearOfStudy, otpChannel } = body;

    // Validate required fields
    if (!email || !password || !confirmPassword || !fullName || !phone) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: email, password, confirmPassword, fullName, phone" },
        { status: 400 }
      );
    }

    // Previously unprotected: unlike login (app/api/customers/login/route.ts)
    // and OTP requests (lib/customerOtp.ts), nothing throttled repeated
    // account-creation calls, each of which creates a real Supabase Auth
    // user. Same dual-key shape and numbers as the login rate limit.
    const ip = getClientIp(req);
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    const [accountLimited, ipLimited] = await Promise.all([
      isRateLimited(`register:account:${normalizedEmail}`, 300, 5),
      isRateLimited(`register:ip:${ip}`, 300, 20),
    ]);
    if (accountLimited || ipLimited) {
      return NextResponse.json(
        { success: false, error: "Too many registration attempts. Please wait a few minutes and try again." },
        { status: 429 }
      );
    }

    if (!["student", "public_traveler", "corporate"].includes(customerType)) {
      return NextResponse.json(
        { success: false, error: "Invalid customer type" },
        { status: 400 }
      );
    }

    const resolvedOtpChannel = otpChannel === "sms" ? "sms" : "email";

    const result = await registerCustomer({
      email,
      password,
      confirmPassword,
      fullName,
      phone,
      customerType,
      studentId,
      university,
      faculty,
      programme,
      yearOfStudy,
      otpChannel: resolvedOtpChannel,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Registration failed" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      userId: result.userId,
      otpChannel: resolvedOtpChannel,
      otpSent: result.otpSent !== false,
      message: result.otpSent === false
        ? "Your account was created, but we couldn't send your verification code just now. On the next screen, tap \"Resend\" to try again."
        : resolvedOtpChannel === "sms"
          ? "Registration successful! Please check your phone for a verification code."
          : "Registration successful! Please check your email for a verification code.",
    });
  } catch (error) {
    console.error("POST /api/customers/register error", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Registration failed" },
      { status: 500 }
    );
  }
}
