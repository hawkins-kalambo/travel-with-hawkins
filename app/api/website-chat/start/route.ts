import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jsonError } from "@/lib/apiResponse";
import { isRateLimited } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/clientIp";
import { requireAuthenticatedUser } from "@/lib/supabaseServer";
import {
  startConversation,
  getConversationByToken,
  getConversationByCustomerId,
  getContactDetails,
  markConversationResolved,
  resolveCustomerId,
  getMessages,
  recordBotMessage,
} from "@/lib/websiteChat/repository";
import { WELCOME_MESSAGE } from "@/lib/websiteChat/respond";

const COOKIE_NAME = "wch_token";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

// Unauthenticated-safe by design (this is also the pre-signup homepage
// widget) — a session is checked but never required. When one exists (the
// widget is mounted for a logged-in customer, see CustomerShell), the
// resulting contact is linked to their customer_profiles row via
// customer_id; anonymous visitors get the same guest flow as before.
// Rate-limited by IP so it can't be used to spam-create contact rows, same
// primitive lib/whatsapp/processor.ts uses for its own unauthenticated
// inbound traffic.
export async function POST(req: NextRequest) {
  try {
    if (await isRateLimited(`website-chat:start:ip:${getClientIp(req)}`, 300, 10)) {
      return jsonError("Too many requests. Please wait a few minutes and try again.", 429);
    }

    const body = await req.json().catch(() => ({}));
    let name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
    let phone = typeof body.phone === "string" ? body.phone.trim().slice(0, 32) : "";
    let email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 254) : "";
    const forceNew = body.forceNew === true;

    // customer_id has a foreign key into customer_profiles — only ever set
    // it for an actual customer session (never admin/operator/ambassador),
    // otherwise the insert would fail its FK constraint outright.
    const sessionCheck = await requireAuthenticatedUser(req, NextResponse.next()).catch(() => ({ user: null }));
    const customerId = await resolveCustomerId(sessionCheck.user?.id);

    // A logged-in customer's conversation is identified by their account,
    // never by the device cookie — otherwise two different customers (or a
    // guest, then a customer) sharing one browser would resume each other's
    // chat just because a cookie was already set on that device.
    const existing = customerId
      ? await getConversationByCustomerId(customerId)
      : await (async () => {
          const token = req.cookies.get(COOKIE_NAME)?.value;
          if (!token) return null;
          const conversation = await getConversationByToken(token);
          return conversation ? { sessionToken: token, conversation } : null;
        })();

    if (existing && !forceNew) {
      const messages = await getMessages(existing.conversation);
      const response = NextResponse.json({ success: true, resumed: true, conversation: existing.conversation, messages });
      response.cookies.set(COOKIE_NAME, existing.sessionToken, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: COOKIE_MAX_AGE_SECONDS,
      });
      return response;
    }

    if (existing && forceNew) {
      // A returning guest's phone/email never round-trips back to the
      // browser (getConversationByToken only returns name), so fall back to
      // the conversation they're leaving behind rather than forcing them to
      // re-type details we already have on file.
      if (!name || (!phone && !email)) {
        const currentContact = await getContactDetails(existing.conversation.contactId);
        if (currentContact) {
          name = name || currentContact.name;
          phone = phone || currentContact.phone || "";
          email = email || currentContact.email || "";
        }
      }
      await markConversationResolved(existing.conversation.conversationId);
    }

    if (!name) return jsonError("Please tell us your name", 400);
    if (!phone && !email) return jsonError("Please share a phone number or email so we can reach you", 400);

    const { sessionToken, conversation } = await startConversation({
      name,
      phone: phone || undefined,
      email: email || undefined,
      customerId,
    });

    const welcome = await recordBotMessage(conversation.conversationId, WELCOME_MESSAGE);

    const response = NextResponse.json({ success: true, resumed: false, conversation, messages: [welcome] });
    response.cookies.set(COOKIE_NAME, sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: COOKIE_MAX_AGE_SECONDS,
    });
    return response;
  } catch (error) {
    console.error("POST /api/website-chat/start error", error);
    return jsonError(error instanceof Error ? error.message : "Unable to start chat", 500);
  }
}
