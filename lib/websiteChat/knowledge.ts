// Deterministic FAQ layer for the homepage chat widget — same shape as
// lib/whatsapp/knowledge.ts (checked before anything else, no AI call
// behind it in this app). "unknown"/"unrelated" both fall through to an
// offer to talk to a human rather than a free-form guess.
const INJECTION = /ignore (all|previous)|system prompt|developer message|reveal.*(prompt|secret)|api key|password|act as|jailbreak/i;

export type KnowledgeAnswer = { outcome: "answered"; text: string } | { outcome: "unknown" | "unrelated" | "unsafe" };

export function answerFromApprovedKnowledge(question: string): KnowledgeAnswer {
  const q = question.trim().toLowerCase();
  if (INJECTION.test(q)) return { outcome: "unsafe" };
  if (/cancel|reschedul|change.*date/.test(q)) {
    return { outcome: "answered", text: "You can request a cancellation or reschedule right here — just share your booking ID. Changes depend on timing and seat availability." };
  }
  if (/refund/.test(q)) {
    return { outcome: "answered", text: "Refunds are handled case by case depending on timing and payment method. Share your booking ID and a team member will take a look." };
  }
  if (/secure|card|pin|payment detail/.test(q)) {
    return { outcome: "answered", text: "Pay only on our secure PayChangu checkout page — we never ask for card details or mobile-money PINs in chat." };
  }
  if (/booking fee|fare.*separate|separate.*fare/.test(q)) {
    return { outcome: "answered", text: "The booking fee is separate from the transport fare unless your booking says otherwise." };
  }
  if (/how.*book|make.*booking|book a trip|book a seat/.test(q)) {
    return { outcome: "answered", text: "Tap \"Book a Trip\" on the homepage, choose your route and date, enter your details, and confirm — it takes about a minute." };
  }
  if (/track|status.*booking|booking.*status/.test(q)) {
    return { outcome: "answered", text: "You can check your booking status anytime by logging into your account and opening the booking from your dashboard." };
  }
  if (/university|campus|which schools?|mzuzu|zomba|lilongwe|blantyre|thyolo/.test(q)) {
    return { outcome: "answered", text: "We currently run scheduled routes for Mzuzu University, with more campuses coming online soon." };
  }
  if (/account|sign ?up|register|create.*account/.test(q)) {
    return { outcome: "answered", text: "Tap \"Create Account\" from the sign-in page — students and public travelers can both register in under a minute." };
  }
  if (/route|fare|price|schedule|date|availability|pickup|luggage|baggage/.test(q)) return { outcome: "unknown" };
  if (/travel with hawkins|booking|payment|bus|trip|operator|ambassador|student/.test(q)) return { outcome: "unknown" };
  return { outcome: "unrelated" };
}
