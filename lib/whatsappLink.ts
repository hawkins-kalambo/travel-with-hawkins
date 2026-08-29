// Canonical builder for every PUBLIC WhatsApp call-to-action (floating button,
// footer, contact page, structured data). One place so the site can never point
// at an old or unrelated WhatsApp destination again.
//
// The official Travel With Hawkins bot number, in wa.me digits-only form (no
// '+', spaces or punctuation). Overridable per-environment with
// NEXT_PUBLIC_WHATSAPP_BOT_NUMBER; the fallback is the confirmed live number
// from the implementation brief. NEXT_PUBLIC_ is inlined at build time and
// carries no secret — a phone number in a wa.me URL is public by design.

const FALLBACK_BOT_NUMBER = "265890845383"; // +265 890 84 53 83
const DEFAULT_PREFILL = "Hi Travel With Hawkins";

export function whatsAppBotNumber(): string {
  const configured = (process.env.NEXT_PUBLIC_WHATSAPP_BOT_NUMBER || "").replace(/\D/g, "");
  return configured || FALLBACK_BOT_NUMBER;
}

// Human-readable form for on-page display, e.g. "+265 890 84 53 83".
export function whatsAppBotNumberDisplay(): string {
  const n = whatsAppBotNumber();
  if (n.length === 12 && n.startsWith("265")) {
    return `+${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6, 8)} ${n.slice(8, 10)} ${n.slice(10)}`;
  }
  return `+${n}`;
}

// A short prefilled message means the inbound webhook fires and the bot can
// send its professional welcome + menu. Never carries tokens / phone-number
// IDs / WABA IDs — only the public number and a greeting.
export function buildWhatsAppLink(prefill: string = DEFAULT_PREFILL): string {
  const text = encodeURIComponent(prefill.trim().slice(0, 300));
  return `https://wa.me/${whatsAppBotNumber()}${text ? `?text=${text}` : ""}`;
}
