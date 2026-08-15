// Deterministic "talk to a human" detector — same trigger words as
// lib/whatsapp/intent.ts's "agent" intent. This always wins over the FAQ
// layer, same as the WhatsApp bot.
export function wantsHuman(rawText: string): boolean {
  const value = rawText.toLowerCase().trim();
  return /\bagent\b|\bhuman\b|real person|\bsomeone\b|talk to (a )?person|representative|staff member|support team|customer service/.test(value);
}
