import "server-only";

import { answerFromApprovedKnowledge } from "@/lib/websiteChat/knowledge";
import { wantsHuman } from "@/lib/websiteChat/intent";
import { recordBotMessage, requestHuman } from "@/lib/websiteChat/repository";
import type { WebsiteChatConversationState, WebsiteChatMessage } from "@/lib/websiteChat/types";

export const WELCOME_MESSAGE =
  "Hi! I'm the Travel with Hawkins assistant. Ask me about booking, payments, or routes — or type \"agent\" anytime to reach a team member.";

const HANDOFF_MESSAGE = "Connecting you with a team member now — they'll reply here as soon as they're available.";
const UNSAFE_MESSAGE = "I can't help with that. Type \"agent\" if you'd like to talk to a team member.";
const UNKNOWN_MESSAGE = "I don't have an answer for that yet. Type \"agent\" to talk to a team member, or try asking a different question.";

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
    return { conversation: next, botMessage };
  }

  const answer = answerFromApprovedKnowledge(text);
  const reply = answer.outcome === "answered" ? answer.text : answer.outcome === "unsafe" ? UNSAFE_MESSAGE : UNKNOWN_MESSAGE;
  const botMessage = await recordBotMessage(conversation.conversationId, reply);
  return { conversation, botMessage };
}
