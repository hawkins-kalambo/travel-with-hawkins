import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { registerCustomer } from "@/lib/customerAuthAdmin";

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
      message:
        resolvedOtpChannel === "sms"
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
