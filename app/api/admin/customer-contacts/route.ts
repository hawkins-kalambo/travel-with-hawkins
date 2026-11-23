import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/supabaseServer";
import { addCustomerContact, listCustomerContacts, setContactOptOut } from "@/lib/customerMessages";
import { normalizeMalawiPhone } from "@/lib/phoneNumbers";
import { logError } from "@/lib/logger";
import { jsonError } from "@/lib/apiResponse";

// Customer contact book for Communication -> Customer Messages. Most rows are
// created by the bookings trigger; admins can also add a contact by hand,
// search them and toggle per-channel opt-outs. Existing contact details are
// never overwritten here.

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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const response = NextResponse.next();
  const { authorized, error } = await requireAdminUser(req, response);
  if (!authorized) return jsonError(error || "Unauthorized", 401);

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const phone = normalizeMalawiPhone(body.phone);
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
    const email = typeof body.email === "string" ? body.email.trim().slice(0, 200) : "";

    if (!phone) return jsonError("Enter a valid Malawi mobile number, e.g. 0991234567", 400);
    if (email && !EMAIL_PATTERN.test(email)) return jsonError("Enter a valid email address", 400);

    const { contact, created } = await addCustomerContact({ phone, name, email });
    return NextResponse.json({ success: true, contact, created }, { status: created ? 201 : 200 });
  } catch (err) {
    logError("POST /api/admin/customer-contacts failed", { error: err instanceof Error ? err.message : String(err) });
    return jsonError("Unable to add customer contact", 500);
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
