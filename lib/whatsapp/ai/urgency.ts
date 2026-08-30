// Deterministic urgent-message detection (§19). Runs BEFORE the AI controller
// so it works even when AI is disabled or unsure. A match routes the customer
// straight to a person; the bot never tries to advise on an emergency.

const URGENT = [
  /\bthe bus (has )?left( without me)?\b/i,
  /\bmissed (the|my) bus\b/i,
  /\bi(?:'m| am)?\s*strand(ed|ing)\b/i,
  /\bstuck (at|in|on)\b.*\b(station|road|bus|stop|depot)\b/i,
  /\bcannot find (the )?(pickup|pick-up|bus|vehicle)\b/i,
  /\bcan'?t find (the )?(pickup|pick-up|bus|vehicle)\b/i,
  /\baccident\b/i,
  /\bcrash(ed)?\b/i,
  /\bdriv(er|ing)\b.{0,20}(danger|reckless|drunk|too fast|speeding|recklessly)/i,
  /\b(danger|reckless|drunk|speeding)\w*\b.{0,20}\bdriv(er|ing)\b/i,
  /\bunsafe\b/i,
  /\bi (feel|am) (scared|afraid|threatened|unsafe)\b/i,
  /\b(deduct|charg|debit)(ed)?\b.{0,30}\b(twice|two times|double|2 times)\b/i,
  /\bdouble[- ]?charg/i,
  /\bpay(ing)?\b.{0,30}\b(personal|private|his own|her own|their own)\s+number\b/i,
  /\bsend money to\b.{0,30}\bnumber\b/i,
  /\bemergency\b/i,
  /\burgent(ly)?\b.{0,20}\b(help|assist)\b/i,
  /\bi need (urgent|immediate) help\b/i,
];

const HIGH = [
  /\bwrong (bus|vehicle|route)\b/i,
  /\bleft my (bag|luggage|phone|wallet)\b/i,
  /\bnot showing up\b/i,
  /\brefund now\b/i,
  /\bhow long.{0,20}\bwaiting\b/i,
];

export type Urgency = "normal" | "high" | "urgent";

export function classifyUrgency(text: string): Urgency {
  const t = String(text || "").slice(0, 600);
  if (URGENT.some((re) => re.test(t))) return "urgent";
  if (HIGH.some((re) => re.test(t))) return "high";
  return "normal";
}
