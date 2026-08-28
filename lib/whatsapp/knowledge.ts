const INJECTION = /ignore (all|previous)|system prompt|developer message|reveal.*(prompt|secret)|api key|password|act as|jailbreak/i;

export type KnowledgeAnswer = { outcome: "answered"; text: string } | { outcome: "unknown" | "unrelated" | "unsafe" };

export function answerFromApprovedKnowledge(question: string): KnowledgeAnswer {
  const q = question.trim().toLowerCase();
  if (INJECTION.test(q)) return { outcome: "unsafe" };
  if (/cancel|reschedul|change.*date/.test(q)) return { outcome: "answered", text: "Contact Travel With Hawkins as soon as possible with your booking ID. Changes depend on timing, seat availability, and the partner operator." };
  if (/refund/.test(q)) return { outcome: "answered", text: "Refund requests are handled case by case and may depend on timing, the operator, and the original payment method. Please ask for an agent with your booking ID." };
  if (/secure|card|pin|payment detail/.test(q)) return { outcome: "answered", text: "Pay only on the secure PayChangu checkout page. Travel With Hawkins does not ask for card details or mobile-money PINs in WhatsApp." };
  if (/booking fee|fare.*separate|separate.*fare/.test(q)) return { outcome: "answered", text: "The booking fee is separate from the transport fare unless your booking explicitly says otherwise." };
  if (/how.*book|make.*booking/.test(q)) return { outcome: "answered", text: "Choose Make a Booking, select a published departure, enter the passenger details, review the summary, and confirm." };
  if (/support|contact|agent|someone/.test(q)) return { outcome: "answered", text: "Choose Talk to an Agent in the menu. You can also email contact@travelwithhawkins.com." };
  if (/luggage|baggage|katundu/.test(q)) return { outcome: "unknown" };
  if (/route|fare|price|schedule|date|availability/.test(q)) return { outcome: "unknown" };
  if (/travel with hawkins|booking|payment|pickup|bus|trip|operator|ambassador/.test(q)) return { outcome: "unknown" };
  return { outcome: "unrelated" };
}
