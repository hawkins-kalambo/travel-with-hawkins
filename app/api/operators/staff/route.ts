import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jsonError } from "@/lib/apiResponse";
import { requireOperatorUser } from "@/lib/operatorAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { inviteOperatorStaff } from "@/lib/operatorStaff";
import { normalizeOperatorStaffRole } from "@/lib/operatorPermissions";

export async function GET(request: NextRequest) {
  const response = NextResponse.next();
  const auth = await requireOperatorUser(request, response);
  if (!auth.authorized) return jsonError(auth.error, auth.status);

  const { data, error } = await supabaseAdmin
    .from("operator_memberships")
    .select("id, user_id, staff_role, status, created_at, profiles(full_name, email, phone)")
    .eq("operator_id", auth.operatorId)
    .order("created_at", { ascending: true });

  if (error) return jsonError("Unable to load staff", 500);

  const staff = (data ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    staffRole: row.staff_role,
    status: row.status,
    createdAt: row.created_at,
    fullName: (row.profiles as { full_name?: string } | null)?.full_name ?? null,
    email: (row.profiles as { email?: string } | null)?.email ?? null,
    phone: (row.profiles as { phone?: string } | null)?.phone ?? null,
  }));

  return NextResponse.json({ success: true, staff });
}

export async function POST(request: NextRequest) {
  const response = NextResponse.next();
  const auth = await requireOperatorUser(request, response, "manageStaff");
  if (!auth.authorized) return jsonError(auth.error, auth.status);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const fullName = typeof body.fullName === "string" ? body.fullName : "";
  const email = typeof body.email === "string" ? body.email : "";
  const phone = typeof body.phone === "string" ? body.phone : "";
  const staffRole = normalizeOperatorStaffRole(body.staffRole);

  if (!staffRole) return jsonError("Unsupported staffRole", 400);
  if (staffRole === "owner" && auth.staffRole !== "owner") {
    return jsonError("Only an owner can add another owner", 403);
  }

  const result = await inviteOperatorStaff({
    operatorId: auth.operatorId,
    invitedByUserId: auth.user.id,
    fullName,
    email,
    phone,
    staffRole,
  });

  if (!result.success) return jsonError(result.error, 400);

  return NextResponse.json({ success: true, userId: result.userId, temporaryPassword: result.temporaryPassword });
}
