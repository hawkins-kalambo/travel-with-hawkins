import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/supabaseServer";
import { listCustomerContacts, setContactOptOut } from "@/lib/customerMessages";
import { logError } from "@/lib/logger";
import { jsonError } from "@/lib/apiResponse";

// Customer contact book for Communication -> Customer Messages. Rows are
// created by the bookings trigger only; admins can search them and toggle
// per-channel opt-outs, never add or edit contact details here.

const MAX_PAGE_SIZE = 100;

export async function GET(req: NextRequest) {
  const response = NextResponse.next();
  const { authorized, error } = await requireAdminUser(req, response);
  if (!authorized) return jsonError(error || "Unauthorized", 401);

  try {
    const url = new URL(req.url);
    const search = url.searchParams.get("search") ?? undefined;
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(url.searchParams.get("limit")) || 50));
    const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);

    const { contacts, total } = await listCustomerContacts({ search, limit, offset });
    return NextResponse.json({ success: true, contacts, total });
  } catch (err) {
    logError("GET /api/admin/customer-contacts failed", { error: err instanceof Error ? err.message : String(err) });
    return jsonError("Unable to load customer contacts", 500);
  }
}

export async function PATCH(req: NextRequest) {
  const response = NextResponse.next();
  const { authorized, error } = await requireAdminUser(req, response);
  if (!authorized) return jsonError(error || "Unauthorized", 401);

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id : "";
    const updates: { sms_opt_out?: boolean; email_opt_out?: boolean } = {};
    if (typeof body.sms_opt_out === "boolean") updates.sms_opt_out = body.sms_opt_out;
    if (typeof body.email_opt_out === "boolean") updates.email_opt_out = body.email_opt_out;

    if (!id || Object.keys(updates).length === 0) {
      return jsonError("Contact ID and an opt-out field are required", 400);
    }

    const contact = await setContactOptOut(id, updates);
    return NextResponse.json({ success: true, contact });
  } catch (err) {
    logError("PATCH /api/admin/customer-contacts failed", { error: err instanceof Error ? err.message : String(err) });
    return jsonError("Unable to update customer contact", 500);
  }
}
