import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/supabaseServer";
import {
  listCustomerMessages,
  sendCustomerMessage,
  MAX_MESSAGE_LENGTH,
  type MessageAudience,
  type MessageChannel,
} from "@/lib/customerMessages";
import { isRateLimited } from "@/lib/rateLimit";
import { normalizeMalawiPhone } from "@/lib/phoneNumbers";
import { logError } from "@/lib/logger";
import { jsonError } from "@/lib/apiResponse";

export const runtime = "nodejs";
// Sending to every customer is chunked (100 numbers per SMS call, 100
// addresses per email batch), but still needs more than the default budget.
export const maxDuration = 60;

const MAX_SELECTED_CONTACTS = 5000;
const MAX_TYPED_NUMBERS = 200;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const response = NextResponse.next();
  const { authorized, error } = await requireAdminUser(req, response);
  if (!authorized) return jsonError(error || "Unauthorized", 401);

  try {
    const messages = await listCustomerMessages();
    return NextResponse.json({ success: true, messages });
  } catch (err) {
    logError("GET /api/admin/customer-messages failed", { error: err instanceof Error ? err.message : String(err) });
    return jsonError("Unable to load sent messages", 500);
  }
}

export async function POST(req: NextRequest) {
  const response = NextResponse.next();
  const { authorized, user, error } = await requireAdminUser(req, response);
  if (!authorized || !user) return jsonError(error || "Unauthorized", 401);

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const text = typeof body.body === "string" ? body.body.trim() : "";
    const subject = typeof body.subject === "string" ? body.subject.trim().slice(0, 150) : undefined;
    const channels = Array.isArray(body.channels)
      ? [...new Set(body.channels.filter((value): value is MessageChannel => value === "sms" || value === "email"))]
      : [];
    const audience: MessageAudience = body.audience === "selected" ? "selected" : "all";
    const contactIds = Array.isArray(body.contactIds)
      ? [...new Set(body.contactIds.filter((value): value is string => typeof value === "string" && UUID_PATTERN.test(value)))]
      : [];

    const rawPhones = Array.isArray(body.phones)
      ? body.phones.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];
    const invalidPhones = rawPhones.filter((value) => !normalizeMalawiPhone(value));
    const phones = [...new Set(rawPhones.map((value) => normalizeMalawiPhone(value)).filter((value): value is string => Boolean(value)))];
    const saveNewContacts = body.saveNewContacts === true;

    if (!text) return jsonError("Message text is required", 400);
    if (text.length > MAX_MESSAGE_LENGTH) return jsonError(`Message must be ${MAX_MESSAGE_LENGTH} characters or fewer`, 400);
    if (channels.length === 0) return jsonError("Choose at least one channel (SMS or email)", 400);
    if (invalidPhones.length > 0) {
      return jsonError(`Not a valid Malawi mobile number: ${invalidPhones.slice(0, 5).join(", ")}`, 400);
    }
    if (phones.length > MAX_TYPED_NUMBERS) return jsonError(`Type at most ${MAX_TYPED_NUMBERS} numbers`, 400);
    if (audience === "selected" && contactIds.length === 0 && phones.length === 0) {
      return jsonError("Select at least one customer or type a phone number", 400);
    }
    if (contactIds.length > MAX_SELECTED_CONTACTS) return jsonError(`Select at most ${MAX_SELECTED_CONTACTS} customers`, 400);

    // Guards against a double-click or retry sending (and paying for) the
    // same bulk SMS twice. Checked after validation so a rejected draft
    // doesn't lock the admin out.
    if (await isRateLimited(`customer-messages:${user.id}`, 30, 1)) {
      return jsonError("A message was just sent. Please wait 30 seconds before sending another.", 429);
    }

    const summary = await sendCustomerMessage({
      subject,
      body: text,
      channels,
      audience,
      contactIds,
      phones,
      saveNewContacts,
      createdBy: user.id,
    });
    return NextResponse.json({ success: true, summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError("POST /api/admin/customer-messages failed", { error: message });
    return jsonError(message.startsWith("No customers") ? message : "Unable to send the message", 500);
  }
}
