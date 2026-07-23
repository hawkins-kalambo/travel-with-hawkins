import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuthenticatedUser } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function GET(req: NextRequest) {
  const response = NextResponse.next();
  const { user, error } = await requireAuthenticatedUser(req, response);

  if (error || !user) {
    return jsonError("Unauthorized", 401);
  }

  const { data, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email, phone, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    const isMissingProfilesTable =
      typeof profileError.message === "string" &&
      profileError.message.includes("Could not find the table 'public.profiles' in the schema cache");

    if (isMissingProfilesTable) {
      const fallbackRole = typeof user.user_metadata?.role === "string" ? user.user_metadata.role : "customer";
      return NextResponse.json({
        success: true,
        profile: {
          id: user.id,
          email: user.email,
          full_name: user.user_metadata?.full_name ?? null,
          phone: user.user_metadata?.phone ?? null,
          role: fallbackRole,
        },
      });
    }

    return jsonError(profileError.message || "Unable to load profile", 500);
  }

  return NextResponse.json({ success: true, profile: data ?? { id: user.id, email: user.email, role: "customer" } });
}
