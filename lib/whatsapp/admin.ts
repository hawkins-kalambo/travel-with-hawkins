import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function requireWhatsAppAdmin(req: NextRequest) {
  const response = NextResponse.next();
  const access = await requireAdminUser(req, response);
  if (!access.authorized || !access.user) return { authorized: false as const, status: 403, error: access.error || "Admin access required" };
  const origin = req.headers.get("origin");
  const fetchSite = req.headers.get("sec-fetch-site");
  if ((origin && origin !== new URL(req.url).origin) || fetchSite === "cross-site") {
    return { authorized: false as const, status: 403, error: "Cross-site request rejected" };
  }
  const admin = await supabaseAdmin.from("admins").select("id,email,full_name,super_admin").eq("id", access.user.id).maybeSingle();
  if (!admin.error && admin.data) {
    await supabaseAdmin.from("profiles").upsert({
      id: access.user.id, email: admin.data.email || access.user.email,
      full_name: admin.data.full_name || admin.data.email,
      role: access.role === "super_admin" ? "super_admin" : "admin",
    }, { onConflict: "id" });
  }
  return { authorized: true as const, user: access.user, role: access.role };
}

export function approvedTemplateNames(): Set<string> {
  return new Set((process.env.WHATSAPP_APPROVED_TEMPLATE_NAMES || "").split(",").map((name) => name.trim()).filter(Boolean));
}
