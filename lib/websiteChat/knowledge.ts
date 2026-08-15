// Deterministic FAQ layer for the homepage chat widget — same shape as
// lib/whatsapp/knowledge.ts (checked before anything else, no AI call
// behind it in this app). Answers are sourced from the site's own approved
// copy (app/components/home/FAQSection.tsx, SiteFooter contact details) so
// the bot never asserts a policy the rest of the site doesn't already state.
// "unknown"/"unrelated" both fall through to an offer to talk to a human
// rather than a free-form guess.
const INJECTION = /ignore (all|previous)|system prompt|developer message|reveal.*(prompt|secret)|api key|password|act as|jailbreak/i;

export type KnowledgeAnswer = { outcome: "answered"; text: string } | { outcome: "unknown" | "unrelated" | "unsafe" };

export function answerFromApprovedKnowledge(question: string): KnowledgeAnswer {
  const q = question.trim().toLowerCase();
  if (INJECTION.test(q)) return { outcome: "unsafe" };

  // A first "hi" is the single most common opening message — answering it
  // with "I don't have an answer for that yet" was the biggest quality gap.
  if (/^(hi|hello|hey|yo|hola)\b[!.]*$/.test(q) || /^good (morning|afternoon|evening)\b/.test(q)) {
    return { outcome: "answered", text: "Hi there! I can help with booking, routes, payments, or your account — what do you need?" };
  }
  if (/^(thanks|thank you|thx|cheers|ok(ay)?|great|cool|got it)\b[!.]*$/.test(q)) {
    return { outcome: "answered", text: "You're welcome! Anything else I can help with?" };
  }

  if (/how.*book|make.*booking|book a trip|book a seat|how.*it works?/.test(q)) {
    return { outcome: "answered", text: "Choose your route or enter a custom destination, fill in your details, pick your travel date and seat count, and submit — takes about a minute. Tap \"Book a Trip\" to start." };
  }
  if (/cancel|reschedul|change.*date/.test(q)) {
    return { outcome: "answered", text: "Changes depend on timing and seat availability. Share your booking ID here and a team member will help as soon as possible." };
  }
  if (/confirm|how will i (get|receive)|did (my|it) go through/.test(q)) {
    return { outcome: "answered", text: "Once you submit a booking it's recorded right away, and our admin team confirms your payment and trip details after that." };
  }
  if (/refund/.test(q)) {
    return { outcome: "answered", text: "Refunds are handled case by case depending on timing and payment method. Share your booking ID and a team member will take a look." };
  }
  if (/payment method|how.*pay|can i pay|pay.*cash|pay.*mobile money|pay.*airtel|pay.*mpamba/.test(q)) {
    return { outcome: "answered", text: "Payments are made and confirmed through the booking process itself, verified by our admin team before your trip is fully confirmed." };
  }
  if (/secure|is it safe|card|pin|payment detail/.test(q)) {
    return { outcome: "answered", text: "Yes — pay only on our secure PayChangu checkout page. We never ask for card details or mobile-money PINs in chat." };
  }
  if (/booking fee|fare.*separate|separate.*fare/.test(q)) {
    return { outcome: "answered", text: "The booking fee is separate from the transport fare unless your booking says otherwise." };
  }
  if (/track|status.*booking|booking.*status|where.*bus|where.*driver/.test(q)) {
    return { outcome: "answered", text: "Log in and open the booking from your dashboard any time to check its current status." };
  }
  // Checked before the university/campus block below — a district name like
  // "Lilongwe" in a price question ("how much to Lilongwe") is about a
  // route/fare, not which campuses are served, and "how much/cost/price" is
  // the more specific signal of the two.
  if (/route|fare|price|cost|how much|schedule|timetable|what time|availability/.test(q)) {
    return { outcome: "answered", text: "Check the Routes/Trips page for current routes, fares, and schedules, or use the trip search on the homepage — fares vary by route and date." };
  }
  if (/university|campus|which schools?|mzuzu|zomba|lilongwe|blantyre|thyolo/.test(q)) {
    return { outcome: "answered", text: "We currently run scheduled routes for Mzuzu University, with more campuses coming online soon." };
  }
  if (/account|sign ?up|register|create.*account|login|log in|forgot.*password/.test(q)) {
    return { outcome: "answered", text: "Tap \"Create Account\" from the sign-in page — students and public travelers can both register in under a minute. Already registered? Use \"Sign In\" instead." };
  }
  if (/support|contact|talk to (someone|a person)|email|phone number|call you/.test(q)) {
    return { outcome: "answered", text: "You can reach our team at contact@travelwithhawkins.com or 0989 127 308, or just type \"agent\" here to connect right in this chat." };
  }
  if (/pickup|picking? up|meet.*point|where.*board/.test(q)) return { outcome: "unknown" };
  if (/luggage|baggage|bag|suitcase/.test(q)) return { outcome: "unknown" };
  if (/travel with hawkins|booking|payment|bus|trip|operator|ambassador|student|driver|seat/.test(q)) return { outcome: "unknown" };
  return { outcome: "unrelated" };
}
