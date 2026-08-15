import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jsonError } from "@/lib/apiResponse";
import { isRateLimited } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/clientIp";
import { getConversationByToken, getMessages, recordGuestMessage } from "@/lib/websiteChat/repository";
import { respondToGuestMessage } from "@/lib/websiteChat/respond";

const COOKIE_NAME = "wch_token";

// Both routes are unauthenticated by design and identify the caller purely
// by the httpOnly session cookie /api/website-chat/start set — there is no
// conversationId in the URL, so there's nothing for a guest to guess or
// enumerate their way into someone else's conversation.
export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return jsonError("No active chat session", 401);

  const conversation = await getConversationByToken(token);
  if (!conversation) return jsonError("No active chat session", 401);

  const messages = await getMessages(conversation);
  return NextResponse.json({ success: true, conversation, messages });
}

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    if (!token) return jsonError("No active chat session", 401);

    if (await isRateLimited(`website-chat:message:ip:${getClientIp(req)}`, 60, 20)) {
      return jsonError("Too many messages. Please slow down.", 429);
    }

    const conversation = await getConversationByToken(token);
    if (!conversation) return jsonError("No active chat session", 401);

    const body = await req.json().catch(() => ({}));
    const text = typeof body.body === "string" ? body.body.trim().slice(0, 2000) : "";
    if (!text) return jsonError("Message content is required", 400);

    const guestMessage = await recordGuestMessage(conversation, text);
    const { conversation: nextConversation, botMessage } = await respondToGuestMessage(conversation, text);

    return NextResponse.json({
      success: true,
      conversation: nextConversation,
      messages: botMessage ? [guestMessage, botMessage] : [guestMessage],
    });
  } catch (error) {
    console.error("POST /api/website-chat/messages error", error);
    return jsonError(error instanceof Error ? error.message : "Unable to send message", 500);
  }
}
