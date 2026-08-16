import "server-only";

import { answerFromApprovedKnowledge } from "@/lib/websiteChat/knowledge";
import { wantsHuman } from "@/lib/websiteChat/intent";
import { recordBotMessage, requestHuman } from "@/lib/websiteChat/repository";
import { notifyAdminOfHandoff } from "@/lib/websiteChat/adminAlerts";
import { logError } from "@/lib/logger";
import type { WebsiteChatConversationState, WebsiteChatMessage } from "@/lib/websiteChat/types";

export const WELCOME_MESSAGE =
  "Hi! I'm the Travel with Hawkins assistant. Ask me about booking, payments, or routes — or type \"agent\" anytime to reach a team member.";

const HANDOFF_MESSAGE = "Connecting you with a team member now — they'll reply here as soon as they're available.";
const UNSAFE_MESSAGE = "I can't help with that. Type \"agent\" if you'd like to talk to a team member.";
// "unknown" = clearly travel-related, but past what I can answer on my own.
// "unrelated" = not about Travel with Hawkins at all — redirect rather than
// pretend to look something up.
const UNKNOWN_MESSAGE = "I don't have specifics on that yet. Type \"agent\" to talk to a team member, or ask me about booking, payments, or routes.";
const UNRELATED_MESSAGE = "I can only help with Travel with Hawkins bookings and travel questions. Type \"agent\" if you'd like to talk to a team member about something else.";

// Given a guest's message, decide the bot's reaction: answer from the FAQ
// layer, hand off to a human, or go silent (once a human already has
// control — mirrors lib/whatsapp/processor.ts's `if (mode === "human") return`).
export async function respondToGuestMessage(
  conversation: WebsiteChatConversationState,
  text: string
): Promise<{ conversation: WebsiteChatConversationState; botMessage: WebsiteChatMessage | null }> {
  if (conversation.mode === "human") {
    return { conversation, botMessage: null };
  }

  if (wantsHuman(text)) {
    const next = await requestHuman(conversation);
    const botMessage = await recordBotMessage(conversation.conversationId, HANDOFF_MESSAGE);
    // Awaited (not fire-and-forget) so it actually completes before this
    // serverless function's response ends -- same convention as the booking
    // route's admin notifications. A failure here must never block the
    // handoff the customer already saw confirmed above.
    await notifyAdminOfHandoff(conversation.conversationId, conversation.contactId, conversation.name).catch((error) => {
      logError("notifyAdminOfHandoff failed", { error: error instanceof Error ? error.message : String(error) });
    });
    return { conversation: next, botMessage };
  }

  const answer = answerFromApprovedKnowledge(text);
  const reply =
    answer.outcome === "answered" ? answer.text :
    answer.outcome === "unsafe" ? UNSAFE_MESSAGE :
    answer.outcome === "unrelated" ? UNRELATED_MESSAGE :
    UNKNOWN_MESSAGE;
  const botMessage = await recordBotMessage(conversation.conversationId, reply);
  return { conversation, botMessage };
}
