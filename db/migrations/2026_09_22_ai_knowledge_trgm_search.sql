-- AI Assistant — Phase A3: fuzzy retrieval for the approved knowledge base.
-- Master plan: "Professional Conversational AI Assistant" §16 (knowledge base) /
-- A3 retrieval depth.
--
-- STATUS: NOT APPLIED. Additive only — one extension, one partial index, one
-- read-only SECURITY DEFINER function. No changes to existing objects, columns
-- or data. Forward-only.
--
-- The assistant works with or without this migration. lib/whatsapp/ai/
-- knowledgeStore.ts calls match_ai_knowledge() first and, when the function is
-- absent (pre-migration) or returns nothing, falls back to an in-process
-- trigram matcher over the active rows, then to the original hard-coded
-- matcher. Applying this migration moves the fuzzy match into Postgres
-- (index-assisted, consistent ranking, scales past a few hundred rows).

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram GIN index over the text the matcher searches. Partial: only active
-- rows are ever matched.
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_trgm
  ON public.ai_knowledge
  USING gin (
    (coalesce(topic, '') || ' ' || coalesce(keywords, '') || ' ' || coalesce(example_questions, '')) gin_trgm_ops
  )
  WHERE is_active;

-- Read-only ranked lookup. Returns active rows in the requested languages whose
-- searchable text is trigram-similar to the query, best first. Never writes.
--
--   word_similarity(query, text) is asymmetric: it scores how well the whole
--   query matches the *best-matching run of words* inside text, so a short
--   question against a long keyword list still scores well.
CREATE OR REPLACE FUNCTION public.match_ai_knowledge(
  p_query      TEXT,
  p_languages  TEXT[] DEFAULT ARRAY['en'],
  p_limit      INT    DEFAULT 5
)
RETURNS TABLE (
  id                 UUID,
  topic              TEXT,
  approved_answer    TEXT,
  language           TEXT,
  keywords           TEXT,
  example_questions  TEXT,
  priority           INTEGER,
  requires_live_data BOOLEAN,
  score              REAL
)
LANGUAGE sql
STABLE
SECURITY DEFINER
-- `extensions` is included because Supabase installs pg_trgm there, not in
-- public; word_similarity() must resolve under the pinned path.
SET search_path = public, extensions, pg_temp
AS $$
  WITH scored AS (
    SELECT
      k.id, k.topic, k.approved_answer, k.language, k.keywords,
      k.example_questions, k.priority, k.requires_live_data,
      word_similarity(
        p_query,
        coalesce(k.topic, '') || ' ' || coalesce(k.keywords, '') || ' ' || coalesce(k.example_questions, '')
      ) AS sim
    FROM public.ai_knowledge k
    WHERE k.is_active
      AND k.language = ANY (p_languages)
  )
  SELECT
    id, topic, approved_answer, language, keywords, example_questions,
    priority, requires_live_data,
    (
      sim
      + CASE WHEN language = 'ny' AND 'ny' = ANY (p_languages) THEN 0.08 ELSE 0 END
      + greatest(0, 200 - priority)::real / 4000
    )::real AS score
  FROM scored
  WHERE sim >= 0.20
  ORDER BY score DESC, priority ASC
  LIMIT greatest(1, least(coalesce(p_limit, 5), 20));
$$;

REVOKE ALL ON FUNCTION public.match_ai_knowledge(TEXT, TEXT[], INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.match_ai_knowledge(TEXT, TEXT[], INT) FROM anon;
REVOKE ALL ON FUNCTION public.match_ai_knowledge(TEXT, TEXT[], INT) FROM authenticated;
-- supabaseAdmin runs as service_role — the only caller.
GRANT EXECUTE ON FUNCTION public.match_ai_knowledge(TEXT, TEXT[], INT) TO service_role;

COMMIT;

-- Staging verification:
--   SELECT extname FROM pg_extension WHERE extname = 'pg_trgm';
--   SELECT indexname FROM pg_indexes WHERE tablename = 'ai_knowledge' AND indexname = 'idx_ai_knowledge_trgm';
--   SELECT topic, round(score::numeric, 3) AS score
--     FROM public.match_ai_knowledge('how do i chnage my bookin date', ARRAY['en'], 5);
--   -- expect "Changing a booking" on top
--   SELECT topic FROM public.match_ai_knowledge('what is the capital of france', ARRAY['en'], 5);
--   -- expect zero rows
