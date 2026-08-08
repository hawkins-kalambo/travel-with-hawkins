import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { escapeLikePattern, requireAuthenticatedUser, resolveAdminRole } from "@/lib/supabaseServer";
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

  const role = await resolveAdminRole(user);
  if (!hasPermission(role, "manageUsers")) {
    return jsonError("Admin access required", 403);
  }

  const { data, error: fetchError } = await supabaseAdmin
    .from("profiles")
    .select("id, email, full_name, role")
    .order("full_name", { ascending: true });

  if (fetchError) {
    return jsonError(fetchError.message || "Unable to load users", 500);
  }

  const [{ data: assignments, error: assignmentsError }, { data: universities, error: universitiesError }] = await Promise.all([
    supabaseAdmin
      .from("university_admin_assignments")
      .select("user_id, university_id, status, can_manage_bookings, can_view_reports, can_confirm_cash")
      .eq("status", "active"),
    supabaseAdmin.from("universities").select("id, name, short_code, status").order("name", { ascending: true }),
  ]);

  if (assignmentsError || universitiesError) {
    return jsonError("Unable to load university administrator assignments", 500);
  }

  const assignmentsByUser = new Map<string, string[]>();
  for (const assignment of assignments ?? []) {
    const current = assignmentsByUser.get(String(assignment.user_id)) ?? [];
    current.push(String(assignment.university_id));
    assignmentsByUser.set(String(assignment.user_id), current);
  }

  const users = (data ?? []).map((profile) => ({
    ...profile,
    universityIds: assignmentsByUser.get(String(profile.id)) ?? [],
  }));

  return NextResponse.json({ success: true, users, universities: universities ?? [] });
}

export async function PATCH(request: NextRequest) {
  const response = NextResponse.next();
  const { user, error } = await requireAuthenticatedUser(request, response);

  if (error || !user) {
    return jsonError("Authentication required", 401);
  }

  const role = await resolveAdminRole(user);
  if (!hasPermission(role, "manageUsers")) {
    return jsonError("Admin access required", 403);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const targetId = typeof body.targetId === "string" ? body.targetId : null;
    const nextRole = typeof body.role === "string" ? normalizeAppRole(body.role) : null;
    const universityIds = Array.isArray(body.universityIds)
      ? Array.from(new Set(body.universityIds.filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0)))
      : [];

    if (!targetId || !nextRole || nextRole === "unknown") {
      return jsonError("targetId and a valid role are required", 400);
    }

    const { data: targetProfile, error: targetError } = await supabaseAdmin
      .from("profiles")
      .select("role, email")
      .eq("id", targetId)
      .maybeSingle();
    if (targetError || !targetProfile) return jsonError("Target profile not found", 404);

    if (targetId === user.id && targetProfile.role === "super_admin" && nextRole !== "super_admin") {
      return jsonError("You cannot remove your own super-admin access", 409);
    }

    if (nextRole === "university_admin") {
      if (universityIds.length === 0) return jsonError("Select at least one university", 400);
      const { error: assignmentError } = await supabaseAdmin.rpc("set_university_admin_assignments", {
        p_user_id: targetId,
        p_university_ids: universityIds,
        p_actor_id: user.id,
        p_can_manage_bookings: true,
        p_can_view_reports: true,
        p_can_confirm_cash: true,
      });
      if (assignmentError) return jsonError(assignmentError.message || "Unable to assign university administrator", 500);
      return NextResponse.json({ success: true, message: "University administrator assignments updated" });
    }

    const { error: updateError } = await supabaseAdmin.from("profiles").update({ role: nextRole }).eq("id", targetId);
    if (updateError) {
      return jsonError(updateError.message || "Unable to update user role", 500);
    }

    const { error: clearAssignmentsError } = await supabaseAdmin
      .from("university_admin_assignments")
      .delete()
      .eq("user_id", targetId);
    if (clearAssignmentsError) return jsonError("Role changed, but old university assignments could not be cleared", 500);

    // The legacy admins table is still an authorization source. When a
    // super admin deliberately moves a staff account to a non-global role,
    // remove matching legacy rows so they cannot silently restore admin
    // access on the next request.
    if (nextRole !== "super_admin" && nextRole !== "admin") {
      const deleteById = await supabaseAdmin.from("admins").delete().eq("id", targetId);
      if (deleteById.error) return jsonError("Role changed, but legacy admin access could not be cleared", 500);

      const targetEmail = typeof targetProfile.email === "string" ? targetProfile.email.trim().toLowerCase() : "";
      if (targetEmail) {
        const deleteByEmail = await supabaseAdmin
          .from("admins")
          .delete()
          .ilike("email", escapeLikePattern(targetEmail));
        if (deleteByEmail.error) return jsonError("Role changed, but legacy admin access could not be cleared", 500);
      }
    }

    await supabaseAdmin.from("audit_logs").insert({
      actor_user_id: user.id,
      actor_role: role,
      action: "change_profile_role",
      entity_type: "profile",
      entity_id: targetId,
      previous_value: { role: targetProfile.role },
      new_value: { role: nextRole },
    });

    return NextResponse.json({ success: true, message: "User role updated" });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to update user role", 500);
  }
}
