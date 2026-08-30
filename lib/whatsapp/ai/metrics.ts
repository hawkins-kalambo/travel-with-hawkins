import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Aggregate AI quality metrics for the admin dashboard (§30). Reads
// whatsapp_ai_interactions only. Fail-soft: returns zeros when the table is
// missing or the query errors.

export type AiQualitySummary = {
  windowDays: number;
  turns: number;
  fallbackRate: number;
  unknownIntentRate: number;
  clarificationRate: number;
  humanHandoverRate: number;
  toolDenied: number;
  urgent: number;
  byLanguage: Record<string, number>;
  topIntents: { intent: string; count: number }[];
  avgResponseMs: number | null;
  feedbackHelpful: number;
  feedbackNeedsHelp: number;
};

const EMPTY = (windowDays: number): AiQualitySummary => ({
  windowDays, turns: 0, fallbackRate: 0, unknownIntentRate: 0, clarificationRate: 0,
  humanHandoverRate: 0, toolDenied: 0, urgent: 0, byLanguage: {}, topIntents: [],
  avgResponseMs: null, feedbackHelpful: 0, feedbackNeedsHelp: 0,
});

type Row = {
  detected_intent: string | null; detected_language: string | null;
  tool_outcome: string; fallback_used: boolean; clarification_requested: boolean;
  human_requested: boolean; urgency: string; response_ms: number | null; feedback: string | null;
};

export async function aiQualitySummary(windowDays = 30): Promise<AiQualitySummary> {
  const days = Math.min(365, Math.max(1, Math.round(windowDays)));
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  let rows: Row[] = [];
  try {
    const result = await supabaseAdmin
      .from("whatsapp_ai_interactions")
      .select("detected_intent, detected_language, tool_outcome, fallback_used, clarification_requested, human_requested, urgency, response_ms, feedback")
      .gte("created_at", since)
      .limit(5000);
    if (result.error) throw result.error;
    rows = (result.data ?? []) as Row[];
  } catch {
    return EMPTY(days);
  }

  const n = rows.length;
  if (!n) return EMPTY(days);

  const rate = (c: number) => Math.round((c / n) * 1000) / 1000;
  const byLanguage: Record<string, number> = {};
  const intents = new Map<string, number>();
  let msSum = 0, msCount = 0;
  let fallback = 0, unknown = 0, clarify = 0, human = 0, denied = 0, urgent = 0, helpful = 0, needsHelp = 0;

  for (const r of rows) {
    if (r.fallback_used) fallback += 1;
    if ((r.detected_intent ?? "unknown") === "unknown") unknown += 1;
    if (r.clarification_requested) clarify += 1;
    if (r.human_requested) human += 1;
    if (r.tool_outcome === "denied") denied += 1;
    if (r.urgency === "urgent") urgent += 1;
    if (r.feedback === "helpful") helpful += 1;
    if (r.feedback === "needs_help" || r.feedback === "needs_improvement") needsHelp += 1;
    const lang = r.detected_language || "unknown";
    byLanguage[lang] = (byLanguage[lang] ?? 0) + 1;
    const intent = r.detected_intent || "unknown";
    intents.set(intent, (intents.get(intent) ?? 0) + 1);
    if (typeof r.response_ms === "number" && r.response_ms >= 0) { msSum += r.response_ms; msCount += 1; }
  }

  return {
    windowDays: days,
    turns: n,
    fallbackRate: rate(fallback),
    unknownIntentRate: rate(unknown),
    clarificationRate: rate(clarify),
    humanHandoverRate: rate(human),
    toolDenied: denied,
    urgent,
    byLanguage,
    topIntents: [...intents.entries()].map(([intent, count]) => ({ intent, count }))
      .sort((a, b) => b.count - a.count).slice(0, 8),
    avgResponseMs: msCount ? Math.round(msSum / msCount) : null,
    feedbackHelpful: helpful,
    feedbackNeedsHelp: needsHelp,
  };
}
