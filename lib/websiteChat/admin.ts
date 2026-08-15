import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/supabaseServer";

// Same admin + same-origin guard as lib/whatsapp/admin.ts's
// requireWhatsAppAdmin — kept as its own small copy rather than a shared
// import so the two channel integrations stay independent of each other.
export async function requireWebsiteChatAdmin(req: NextRequest) {
  const response = NextResponse.next();
  const access = await requireAdminUser(req, response);
  if (!access.authorized || !access.user) return { authorized: false as const, status: 403, error: access.error || "Admin access required" };
  const origin = req.headers.get("origin");
  const fetchSite = req.headers.get("sec-fetch-site");
  if ((origin && origin !== new URL(req.url).origin) || fetchSite === "cross-site") {
    return { authorized: false as const, status: 403, error: "Cross-site request rejected" };
  }
  return { authorized: true as const, user: access.user, role: access.role };
}
