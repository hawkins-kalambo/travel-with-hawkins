import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { logAmbassadorActivity } from "@/lib/ambassadorActivity";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function generateTemporaryPassword() {
  return `TWH${Math.random().toString(36).slice(2, 10).toUpperCase()}!`;
}

export async function POST(req: NextRequest) {
  const response = NextResponse.next();
  const { authorized, error } = await requireAdminUser(req, response);
  if (!authorized) return jsonError(error || "Unauthorized", 401);

  try {
    const body = (await req.json()) as { email?: string; mode?: "send-reset" | "temporary-password" };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const mode = body.mode || "send-reset";

    if (!email) return jsonError("Email is required", 400);

    if (mode === "send-reset") {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://travel-with-hawkins.vercel.app";
      const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
        redirectTo: `${appUrl.replace(/\/$/, "")}/reset-password`,
      });

      if (resetError) throw resetError;
      return NextResponse.json({ success: true, message: "Password reset email sent successfully." });
    }

    const { data: userList } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const targetUser = userList.users.find((user) => user.email?.toLowerCase() === email);

    if (!targetUser?.id) {
      return jsonError("No matching ambassador account found", 404);
    }

    const temporaryPassword = generateTemporaryPassword();
    const { error: userUpdateError } = await supabaseAdmin.auth.admin.updateUserById(targetUser.id, {
      password: temporaryPassword,
      user_metadata: {
        ...(targetUser.user_metadata || {}),
        forcePasswordChange: true,
      },
    });

    if (userUpdateError) throw userUpdateError;

    const { data: ambassadorRow } = await supabaseAdmin.from("ambassadors").select("id").eq("email", email).maybeSingle();
    if (ambassadorRow?.id) {
      await logAmbassadorActivity({
        ambassadorId: ambassadorRow.id,
        activityType: "password_changed",
        description: "Admin generated a temporary password for ambassador",
      });
    }

    return NextResponse.json({
      success: true,
      message: "Temporary password generated successfully.",
      temporaryPassword,
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to process password reset", 500);
  }
}
