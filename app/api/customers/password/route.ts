import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuthenticatedUser } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { newPassword, confirmPassword, currentPassword, mode } = body;

    if (!mode || !["reset", "change"].includes(mode)) {
      return NextResponse.json(
        { success: false, error: "Invalid mode. Must be 'reset' or 'change'" },
        { status: 400 }
      );
    }

    if (!newPassword || !confirmPassword) {
      return NextResponse.json(
        { success: false, error: "newPassword and confirmPassword are required" },
        { status: 400 }
      );
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { success: false, error: "Passwords do not match" },
        { status: 400 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { success: false, error: "Password must be at least 8 characters long" },
        { status: 400 }
      );
    }

    // Both modes require the caller to be authenticated as the account
    // being changed — "reset" previously had no auth check at all, and
    // both modes previously read/wrote password state through a single
    // module-level Supabase client shared across every request on the
    // server (lib/auth.ts), so one customer's in-flight session could leak
    // into another's request and get their password overwritten. Every
    // operation below is scoped explicitly to this request's own verified
    // user id — never an ambient/shared session.
    const response = NextResponse.next();
    const authResult = await requireAuthenticatedUser(req, response);

    if (authResult.error || !authResult.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const userId = authResult.user.id;

    if (mode === "change") {
      if (!currentPassword) {
        return NextResponse.json(
          { success: false, error: "currentPassword is required for change mode" },
          { status: 400 }
        );
      }

      // Verify the caller actually knows the current password using a
      // fresh, throwaway client — never the shared singleton — so this
      // sign-in attempt can't leave session state another request might
      // later read.
      const verifyClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error: verifyError } = await verifyClient.auth.signInWithPassword({
        email: authResult.user.email || "",
        password: currentPassword,
      });

      if (verifyError) {
        return NextResponse.json({ success: false, error: "Current password is incorrect" }, { status: 400 });
      }
    }

    // Applies to this request's own verified user id only, via the
    // service-role admin API — not `updateUser()` on any session-bearing
    // client, so there's no ambient-session state to mix up between
    // requests.
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: newPassword });

    if (updateError) {
      return NextResponse.json(
        { success: false, error: updateError.message || `Failed to ${mode === "change" ? "change" : "reset"} password` },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: mode === "change" ? "Password changed successfully" : "Password reset successful",
    });
  } catch (error) {
    console.error("POST /api/customers/password error", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Password operation failed" },
      { status: 500 }
    );
  }
}
