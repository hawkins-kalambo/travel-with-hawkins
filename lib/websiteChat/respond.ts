import "server-only";

import { answerFromApprovedKnowledge } from "@/lib/websiteChat/knowledge";
import { wantsHuman } from "@/lib/websiteChat/intent";
import { recordBotMessage, requestHuman } from "@/lib/websiteChat/repository";
import { notifyAdminOfHandoff } from "@/lib/websiteChat/adminAlerts";
import { getWhatsAppAiProvider } from "@/lib/whatsapp/ai-provider";
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
const BOOKING_HINT = "You can book from the homepage — pick a route or enter a custom destination, add your details and travel date, then submit. Tap \"Book a Trip\" to start.";
const ACCOUNT_HINT = "Log in and open the booking from your dashboard to check its current status or payment. I can't look up live booking or payment details from here.";

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
  if (answer.outcome === "answered") {
    const botMessage = await recordBotMessage(conversation.conversationId, answer.text);
    return { conversation, botMessage };
  }
  // "unsafe" (prompt injection) is a hard stop — never forwarded to the model.
  if (answer.outcome === "unsafe") {
    const botMessage = await recordBotMessage(conversation.conversationId, UNSAFE_MESSAGE);
    return { conversation, botMessage };
  }

  // "unknown" / "unrelated": the deterministic layer couldn't place it. Ask the
  // SAME server-side provider the WhatsApp bot uses (reused, not a parallel
  // client; disabled -> null). It only proposes an intent or replies strictly
  // from the approved facts — it never looks up a fare, seat, schedule,
  // booking or payment. Only the guest's message text is sent.
  const provider = getWhatsAppAiProvider();
  let reply = answer.outcome === "unrelated" ? UNRELATED_MESSAGE : UNKNOWN_MESSAGE;
  if (provider) {
    try {
      const ai = await provider.interpret(text, "en");
      if (ai.answer) reply = ai.answer;
      else if (ai.intent === "agent") {
        const next = await requestHuman(conversation);
        const botMessage = await recordBotMessage(conversation.conversationId, HANDOFF_MESSAGE);
        await notifyAdminOfHandoff(conversation.conversationId, conversation.contactId, conversation.name)
          .catch((error) => logError("notifyAdminOfHandoff failed", { error: error instanceof Error ? error.message : String(error) }));
        return { conversation: next, botMessage };
      }
      else if (ai.intent === "routes" || ai.intent === "booking") reply = BOOKING_HINT;
      else if (ai.intent === "tracking" || ai.intent === "payment") reply = ACCOUNT_HINT;
      // clarify / question / menu / unknown -> keep the safe fallback above.
    } catch (error) {
      logError("website chat AI interpret failed", { error: error instanceof Error ? error.message : String(error) });
    }
  }
  const botMessage = await recordBotMessage(conversation.conversationId, reply);
  return { conversation, botMessage };
}
