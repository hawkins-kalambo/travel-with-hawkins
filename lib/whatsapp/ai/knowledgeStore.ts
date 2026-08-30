import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { logWarn } from "@/lib/logger";
import { answerFromApprovedKnowledge } from "@/lib/whatsapp/knowledge";
import type { WhatsAppLanguage } from "@/lib/whatsapp/types";

// Approved-knowledge retrieval.
//
// Order of preference:
//   1. Postgres ranked match — match_ai_knowledge() (pg_trgm word_similarity),
//      index-backed, added by db/migrations/2026_09_22_ai_knowledge_trgm_search.sql.
//   2. In-process trigram match over the active rows — typo / paraphrase
//      tolerant, used whenever that function is absent (pre-migration) or
//      returns nothing.
//   3. The original hard-coded matcher (answerFromApprovedKnowledge) — so the
//      assistant is never worse than before the knowledge base existed.
// A prompt-injection question is refused before any of this.

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

type ScoredRow = { row: Row; score: number };

// --- fuzzy helpers -----------------------------------------------------------

function trigrams(value: string): Set<string> {
  const padded = `  ${value.toLowerCase()}  `;
  const out = new Set<string>();
  for (let i = 0; i < padded.length - 2; i += 1) out.add(padded.slice(i, i + 3));
  return out;
}

// Sørensen–Dice similarity over character trigrams: 1 = identical, 0 = disjoint.
function diceSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const A = trigrams(a);
  const B = trigrams(b);
  let shared = 0;
  for (const gram of A) if (B.has(gram)) shared += 1;
  return (2 * shared) / (A.size + B.size);
}

function haystack(row: Row): string {
  return `${row.keywords ?? ""} ${row.example_questions ?? ""} ${row.topic}`;
}

// 0..1 confidence that the question is about this row, from graded token overlap.
function scoreRow(words: string[], row: Row, language: WhatsAppLanguage): number {
  const hayLower = haystack(row).toLowerCase();
  const hayTokens = tokens(hayLower);
  let sum = 0;
  for (const w of words) {
    let best = hayLower.includes(w) ? 1 : 0;
    if (best < 1) {
      for (const h of hayTokens) {
        const s = diceSimilarity(w, h);
        if (s > best) best = s;
      }
    }
    if (best >= 0.34) sum += best; // ignore incidental trigram noise
  }
  const norm = words.length ? sum / words.length : 0;
  const langBonus = language === "ny" && row.language === "ny" ? 0.08 : 0;
  const priorityBonus = Math.max(0, 200 - row.priority) / 4000; // <=0.05 tiebreak
  return norm + langBonus + priorityBonus;
}

function toHit(row: Row): KnowledgeHit {
  return {
    source: "table",
    id: row.id,
    topic: row.topic,
    answer: row.approved_answer,
    language: row.language === "ny" ? "ny" : "en",
    requiresLiveData: row.requires_live_data === true,
  };
}

// --- data access (each returns null when the source is unavailable) ---------

async function rankedFromPostgres(question: string, langs: string[]): Promise<ScoredRow[] | null> {
  const admin = supabaseAdmin as unknown as {
    rpc?: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  };
  if (typeof admin.rpc !== "function") return null;
  try {
    const { data, error } = await admin.rpc("match_ai_knowledge", {
      p_query: question,
      p_languages: langs,
      p_limit: 5,
    });
    if (error) return null;
    const list = Array.isArray(data) ? (data as (Row & { score: number | string })[]) : [];
    if (!list.length) return null;
    return list.map((r) => ({ row: r, score: typeof r.score === "number" ? r.score : Number(r.score) || 0 }));
  } catch {
    return null;
  }
}

async function activeRows(langs: string[]): Promise<Row[] | null> {
  try {
    const result = await supabaseAdmin
      .from("ai_knowledge")
      .select("id, topic, approved_answer, language, keywords, example_questions, priority, requires_live_data")
      .eq("is_active", true)
      .in("language", langs)
      .order("priority", { ascending: true })
      .limit(80);
    if (result.error) throw result.error;
    return (result.data ?? []) as Row[];
  } catch (error) {
    // Table missing (pre-migration) or a query error — fall back, don't fail.
    logWarn("ai_knowledge lookup failed; using builtin", {
      code: error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "unknown",
    });
    return null;
  }
}

// The existing keyword matcher, wrapped so callers get one shape.
function builtin(question: string): KnowledgeHit {
  const r = answerFromApprovedKnowledge(question);
  if (r.outcome === "answered") return { source: "builtin", answer: r.text, requiresLiveData: false };
  return { source: "none", outcome: r.outcome };
}

// Minimum confidence to serve a stored answer. Short questions must clear a
// higher bar because a single fuzzy token can carry them.
const PG_MIN_SCORE = 0.3;
function jsMinScore(wordCount: number): number {
  return wordCount <= 2 ? 0.55 : 0.45;
}

export async function searchKnowledge(
  question: string, language: WhatsAppLanguage,
): Promise<KnowledgeHit> {
  const q = String(question || "").slice(0, 400);
  const injectionSafe = builtin(q);
  if (injectionSafe.source === "none" && injectionSafe.outcome === "unsafe") return injectionSafe;

  const words = tokens(q);
  if (!words.length) return injectionSafe;

  const langs = language === "ny" ? ["ny", "en"] : ["en"];

  const ranked = await rankedFromPostgres(q, langs);
  if (ranked) {
    const top = ranked[0];
    return top && top.score >= PG_MIN_SCORE ? toHit(top.row) : injectionSafe;
  }

  const rows = await activeRows(langs);
  if (!rows || !rows.length) return injectionSafe;

  let best: ScoredRow | null = null;
  for (const row of rows) {
    const score = scoreRow(words, row, language);
    if (!best || score > best.score) best = { row, score };
  }
  if (!best || best.score < jsMinScore(words.length)) return injectionSafe;
  return toHit(best.row);
}
