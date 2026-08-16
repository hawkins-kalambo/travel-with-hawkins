import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jsonError } from "@/lib/apiResponse";
import { isRateLimited } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/clientIp";
import { requireAuthenticatedUser } from "@/lib/supabaseServer";
import { getConversationByToken, getConversationByCustomerId, resolveCustomerId, getMessages, getAgentPresence, recordGuestMessage } from "@/lib/websiteChat/repository";
import { respondToGuestMessage } from "@/lib/websiteChat/respond";
import type { WebsiteChatConversationState } from "@/lib/websiteChat/types";

const COOKIE_NAME = "wch_token";

// Guests are identified purely by the httpOnly session cookie
// /api/website-chat/start set — there is no conversationId in the URL, so
// there's nothing for a guest to guess or enumerate their way into someone
// else's conversation. A logged-in customer must instead be resolved by
// their account (see getConversationByCustomerId) — never by that same
// device cookie, which could belong to a different visitor (a guest, or
// another customer) who used this browser earlier.
async function resolveConversation(req: NextRequest): Promise<WebsiteChatConversationState | null> {
  const sessionCheck = await requireAuthenticatedUser(req, NextResponse.next()).catch(() => ({ user: null }));
  const customerId = await resolveCustomerId(sessionCheck.user?.id);

  if (customerId) {
    const byCustomer = await getConversationByCustomerId(customerId);
    return byCustomer?.conversation ?? null;
  }

  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return getConversationByToken(token);
}

export async function GET(req: NextRequest) {
  const conversation = await resolveConversation(req);
  if (!conversation) return jsonError("No active chat session", 401);

  const [messages, agentPresence] = await Promise.all([
    getMessages(conversation),
    // Only relevant once a human has taken over -- skip the query otherwise.
    conversation.mode === "human" ? getAgentPresence(conversation.conversationId) : Promise.resolve(null),
  ]);
  return NextResponse.json({ success: true, conversation, messages, agentPresence });
}

export async function POST(req: NextRequest) {
  try {
    if (await isRateLimited(`website-chat:message:ip:${getClientIp(req)}`, 60, 20)) {
      return jsonError("Too many messages. Please slow down.", 429);
    }

    const conversation = await resolveConversation(req);
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
