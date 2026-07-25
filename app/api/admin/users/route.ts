import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuthenticatedUser } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hasPermission, normalizeAppRole } from "@/lib/permissions";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function GET(request: NextRequest) {
  const response = NextResponse.next();
  const { user, error } = await requireAuthenticatedUser(request, response);

  if (error || !user) {
    return jsonError("Authentication required", 401);
  }

  const profileRole = normalizeAppRole((await supabaseAdmin.from("profiles").select("role").eq("id", user.id).maybeSingle()).data?.role);
  if (!hasPermission(profileRole, "manageUsers")) {
    return jsonError("Admin access required", 403);
  }

  const { data, error: fetchError } = await supabaseAdmin
    .from("profiles")
    .select("id, email, full_name, role")
    .order("full_name", { ascending: true });

  if (fetchError) {
    return jsonError(fetchError.message || "Unable to load users", 500);
  }

  return NextResponse.json({ success: true, users: data ?? [] });
}

export async function PATCH(request: NextRequest) {
  const response = NextResponse.next();
  const { user, error } = await requireAuthenticatedUser(request, response);

  if (error || !user) {
    return jsonError("Authentication required", 401);
  }

  const profileRole = normalizeAppRole((await supabaseAdmin.from("profiles").select("role").eq("id", user.id).maybeSingle()).data?.role);
  if (!hasPermission(profileRole, "manageUsers")) {
    return jsonError("Admin access required", 403);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const targetId = typeof body.targetId === "string" ? body.targetId : null;
    const nextRole = typeof body.role === "string" ? normalizeAppRole(body.role) : null;

    if (!targetId || !nextRole || nextRole === "unknown") {
      return jsonError("targetId and a valid role are required", 400);
    }

    const { error: updateError } = await supabaseAdmin.from("profiles").update({ role: nextRole }).eq("id", targetId);
    if (updateError) {
      return jsonError(updateError.message || "Unable to update user role", 500);
    }

    return NextResponse.json({ success: true, message: "User role updated" });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to update user role", 500);
  }
}
