import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { jsonError } from "@/lib/apiResponse";

// Small, admin-gated (not the stricter manageUsers-only permission
// GET /api/admin/users requires) list of admin-role profiles, used by the
// support-ticket assignee picker in app/admin/communication/support-tickets.tsx —
// any admin should be able to see who tickets can be assigned to, without
// needing full user-management access.
export async function GET(req: NextRequest) {
  const response = NextResponse.next();
  const { authorized, error } = await requireAdminUser(req, response);
  if (!authorized) return jsonError(error || "Unauthorized", 401);

  const { data, error: fetchError } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email")
    .in("role", ["admin", "super_admin"])
    .order("full_name", { ascending: true });

  if (fetchError) return jsonError(fetchError.message || "Unable to load staff", 500);
  return NextResponse.json({ success: true, staff: data ?? [] });
}
