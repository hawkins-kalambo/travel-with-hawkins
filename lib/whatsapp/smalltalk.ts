// Recognise a message that is ONLY a social pleasantry — a thank-you, a bare
// greeting, or a sign-off. The Q&A step routes these to the knowledge base and
// then the model, neither of which answers them, so the customer gets silence
// or an awkward "I didn't understand". A pleasantry deserves a warm one-liner.
//
// Anything that also carries a real request (a question mark, or a booking /
// route / payment keyword) returns null and follows the normal path — so
// "thanks, how much to Lilongwe?" is still treated as a question.

export type Smalltalk = "thanks" | "greeting" | "farewell";

const THANKS = /\b(thanks?|thank\s?you|thank\s?u|thankyou|thnx|thx|ty|much\s+appreciated|appreciate\s+(it|that|you|the\s+help)|grateful|zikomo|ndikuyamika|nikuyamika|asante|shukran)\b/i;

const GREETING = /^(hi+|hie|hey+|hello+|helo|hallo|yo|howzit|greetings|good\s*(morning|afternoon|evening|day)|moni|mwadzuka\s+bwanji|muli\s+bwanji|takulandirani)\b/i;

const FAREWELL = /\b(bye+|goodbye|good\s?bye|see\s+(you|ya)|cheers|later|that'?s\s+(all|it)|that\s+is\s+all|nothing\s+else|no\s+more|i'?m\s+(good|fine|ok(ay)?|sorted|set)|we'?re\s+(good|fine|ok(ay)?)|all\s+(good|set|sorted))\b/i;

// If any of these show up, there is real business intent — don't intercept.
const HAS_REQUEST = /\?|\b(how\s+much|fare|price|cost|routes?|book(ing)?|reserve|pay(ment)?|cancel|refund|receipt|pick\s?up|luggage|baggage|seat|trip|schedule|departure|available|availability|when|where|which|status|confirm)\b/i;

export function classifySmalltalk(text: string): Smalltalk | null {
  const q = String(text ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!q) return null;
  if (q.length > 60 || q.split(" ").length > 9) return null;
  if (HAS_REQUEST.test(q)) return null;
  if (THANKS.test(q)) return "thanks";
  if (FAREWELL.test(q)) return "farewell";
  if (GREETING.test(q)) return "greeting";
  return null;
}
