import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jsonError } from "@/lib/apiResponse";
import { isRateLimited } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/clientIp";
import { startConversation, getConversationByToken, getMessages, recordBotMessage } from "@/lib/websiteChat/repository";
import { WELCOME_MESSAGE } from "@/lib/websiteChat/respond";

const COOKIE_NAME = "wch_token";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

// Unauthenticated by design (this is the pre-signup homepage widget) — no
// requireAuthenticatedUser call here. Rate-limited by IP so it can't be used
// to spam-create contact rows, same primitive lib/whatsapp/processor.ts uses
// for its own unauthenticated inbound traffic.
export async function POST(req: NextRequest) {
  try {
    if (await isRateLimited(`website-chat:start:ip:${getClientIp(req)}`, 300, 10)) {
      return jsonError("Too many requests. Please wait a few minutes and try again.", 429);
    }

    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
    const phone = typeof body.phone === "string" ? body.phone.trim().slice(0, 32) : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 254) : "";

    if (!name) return jsonError("Please tell us your name", 400);
    if (!phone && !email) return jsonError("Please share a phone number or email so we can reach you", 400);

    // A returning visitor with a live cookie resumes their existing
    // conversation instead of opening a new one every time they reload.
    const existingToken = req.cookies.get(COOKIE_NAME)?.value;
    if (existingToken) {
      const existing = await getConversationByToken(existingToken);
      if (existing) {
        const messages = await getMessages(existing);
        return NextResponse.json({ success: true, resumed: true, conversation: existing, messages });
      }
    }

    const { sessionToken, conversation } = await startConversation({
      name,
      phone: phone || undefined,
      email: email || undefined,
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
