import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { loginCustomer } from "@/lib/customerAuth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const { email, password } = body;

    // Validate required fields
    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: email, password" },
        { status: 400 }
      );
    }

    const result = await loginCustomer({
      email,
      password,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Login failed" },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      userId: result.userId,
      message: "Login successful",
    });
  } catch (error) {
    console.error("POST /api/customers/login error", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Login failed" },
      { status: 500 }
    );
  }
}
