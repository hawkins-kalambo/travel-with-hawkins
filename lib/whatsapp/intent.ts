import type { WhatsAppActionId, WhatsAppLanguage } from "@/lib/whatsapp/types";

export type DeterministicIntent =
  | "menu" | "back" | "cancel" | "restart" | "agent" | "opt_out" | "opt_in"
  | "routes" | "booking" | "payment" | "tracking" | "question" | "language" | "unknown";

const ACTION_INTENTS: Partial<Record<WhatsAppActionId, DeterministicIntent>> = {
  menu_routes: "routes", menu_booking: "booking", menu_payment: "payment",
  menu_tracking: "tracking", menu_question: "question", menu_agent: "agent",
  menu_language: "language", flow_cancel: "cancel", flow_back: "back",
};

export function detectIntent(rawText: string, actionId?: string): DeterministicIntent {
  if (actionId && ACTION_INTENTS[actionId as WhatsAppActionId]) return ACTION_INTENTS[actionId as WhatsAppActionId]!;
  const value = rawText.toLowerCase().trim().replace(/[.!?]+$/g, "");
  if (["stop", "unsubscribe", "opt out", "lekani", "siyani"].includes(value)) return "opt_out";
  if (["start", "subscribe", "opt in", "yambani"].includes(value)) return "opt_in";
  // Standalone greetings and "menu" always return to the main menu. Matched
  // on the whole trimmed message so "hello, I need help" still flows to a
  // real intent.
  if (["menu", "main menu", "0", "hi", "hie", "hey", "hello", "helo", "moni", "bwanji"].includes(value)) return "menu";
  if (["back", "b", "mbuyo"].includes(value)) return "back";
  if (["cancel", "exit", "letsani"].includes(value)) return "cancel";
  if (["restart", "reset", "start over", "yambiraninso"].includes(value)) return "restart";
  if (/agent|human|someone|munthu|wothandiza|lankhulani/.test(value)) return "agent";
  if (/track|status.*booking|booking.*status|tsatir|onani.*booking/.test(value)) return "tracking";
  if (/pay|payment|booking fee|lipir/.test(value)) return "payment";
  if (/book|booking|pangani booking|kupanga booking/.test(value)) return "booking";
  if (/route|fare|how much|travel from|travel to|ulendo|ndikufuna kupita|mtengo/.test(value)) return "routes";
  if (/language|english|chichewa|chilankhulo/.test(value)) return "language";
  if (value.length > 3) return "question";
  return "unknown";
}

export function languageFromInput(rawText: string, actionId?: string): WhatsAppLanguage | undefined {
  if (actionId === "lang_en") return "en";
  if (actionId === "lang_ny") return "ny";
  const value = rawText.trim().toLowerCase();
  if (["english", "en", "1"].includes(value)) return "en";
  if (["chichewa", "ny", "2"].includes(value)) return "ny";
  return undefined;
}
