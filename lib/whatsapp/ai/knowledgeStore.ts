import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { logWarn } from "@/lib/logger";
import { answerFromApprovedKnowledge } from "@/lib/whatsapp/knowledge";
import type { WhatsAppLanguage } from "@/lib/whatsapp/types";

// Approved-knowledge retrieval (Stage 2). Reads the admin-managed
// `ai_knowledge` table; when that table is empty or unavailable it falls back
// to the existing hard-coded matcher so the assistant is never worse than
// before this stage.

export type KnowledgeHit =
  | { source: "table"; id: string; topic: string; answer: string; language: WhatsAppLanguage; requiresLiveData: boolean }
  | { source: "builtin"; answer: string; requiresLiveData: false }
  | { source: "none"; outcome: "unknown" | "unrelated" | "unsafe" };

const STOP = new Set([
  "the", "a", "an", "is", "are", "do", "does", "can", "i", "you", "we", "to", "of",
  "for", "and", "or", "my", "me", "on", "in", "at", "how", "what", "when", "where",
  "please", "hi", "hello", "it", "this", "that", "with", "from",
]);

function tokens(text: string): string[] {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

type Row = {
  id: string; topic: string; approved_answer: string; language: string;
  keywords: string | null; example_questions: string | null;
  priority: number; requires_live_data: boolean;
};

// The existing keyword matcher, wrapped so callers get one shape.
function builtin(question: string): KnowledgeHit {
  const r = answerFromApprovedKnowledge(question);
  if (r.outcome === "answered") return { source: "builtin", answer: r.text, requiresLiveData: false };
  return { source: "none", outcome: r.outcome };
}

export async function searchKnowledge(
  question: string, language: WhatsAppLanguage,
): Promise<KnowledgeHit> {
  const q = String(question || "").slice(0, 400);
  const injectionSafe = builtin(q);
  if (injectionSafe.source === "none" && injectionSafe.outcome === "unsafe") return injectionSafe;

  const words = tokens(q);
  if (!words.length) return injectionSafe;

  let rows: Row[] = [];
  try {
    const result = await supabaseAdmin
      .from("ai_knowledge")
      .select("id, topic, approved_answer, language, keywords, example_questions, priority, requires_live_data")
      .eq("is_active", true)
      .in("language", language === "ny" ? ["ny", "en"] : ["en"])
      .order("priority", { ascending: true })
      .limit(80);
    if (result.error) throw result.error;
    rows = (result.data ?? []) as Row[];
  } catch (error) {
    // Table missing (pre-migration) or a query error — fall back, don't fail.
    logWarn("ai_knowledge lookup failed; using builtin", {
      code: error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "unknown",
    });
    return injectionSafe;
  }
  if (!rows.length) return injectionSafe;

  let best: { row: Row; score: number } | null = null;
  for (const row of rows) {
    const hay = `${row.keywords ?? ""} ${row.example_questions ?? ""} ${row.topic}`.toLowerCase();
    let score = 0;
    for (const w of words) if (hay.includes(w)) score += 1;
    // Prefer the customer's own language and higher-priority (lower number) rows.
    if (score > 0) {
      const langBonus = (language === "ny" && row.language === "ny") ? 0.5 : 0;
      const priBonus = Math.max(0, (200 - row.priority)) / 400; // small tiebreaker
      const total = score + langBonus + priBonus;
      if (!best || total > best.score) best = { row, score: total };
    }
  }

  // Need at least 2 signal words to overlap, or 1 for a very short question.
  const threshold = words.length <= 2 ? 1 : 2;
  if (!best || best.score < threshold) return injectionSafe;

  return {
    source: "table",
    id: best.row.id,
    topic: best.row.topic,
    answer: best.row.approved_answer,
    language: best.row.language === "ny" ? "ny" : "en",
    requiresLiveData: best.row.requires_live_data === true,
  };
}
