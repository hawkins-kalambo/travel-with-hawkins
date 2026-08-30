-- AI Assistant — Stage 2: the admin-managed approved knowledge base.
-- Master plan: "Professional Conversational AI Assistant" §16.
--
-- STATUS: NOT APPLIED. Additive only — one table + one append-only history
-- table + one trigger. No changes to existing objects.
--
-- The assistant searches these rows before composing any general business
-- answer. Groq may only *rephrase* an approved answer; it may never invent
-- one, and it may never write to this table. All edits are made by an
-- authenticated operator through the admin API, and every change is versioned.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ai_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  topic TEXT NOT NULL CHECK (length(btrim(topic)) BETWEEN 1 AND 160),
  category TEXT NOT NULL DEFAULT 'general'
    CHECK (category IN (
      'general', 'faq', 'booking', 'booking_fee', 'payment', 'cancellation',
      'luggage', 'pickup', 'business_info', 'contact', 'student_travel',
      'university_travel', 'support'
    )),

  -- Example customer phrasings, one per line, used for matching.
  example_questions TEXT NOT NULL DEFAULT '',
  approved_answer TEXT NOT NULL CHECK (length(btrim(approved_answer)) BETWEEN 1 AND 2000),

  language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'ny')),
  keywords TEXT NOT NULL DEFAULT '',

  is_active BOOLEAN NOT NULL DEFAULT false,
  priority INTEGER NOT NULL DEFAULT 100,

  -- When true the assistant must call a live tool rather than answer from the
  -- static text (e.g. "what's the fare" needs getPublicFare).
  requires_live_data BOOLEAN NOT NULL DEFAULT false,
  -- Draft state for AI-suggested entries and unreviewed Chichewa wording.
  requires_review BOOLEAN NOT NULL DEFAULT false,

  version INTEGER NOT NULL DEFAULT 1,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  last_reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_knowledge_active
  ON public.ai_knowledge (language, priority, updated_at DESC)
  WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_review
  ON public.ai_knowledge (requires_review, created_at DESC)
  WHERE requires_review;
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_keywords
  ON public.ai_knowledge USING gin (to_tsvector('simple', coalesce(keywords, '') || ' ' || coalesce(example_questions, '')));

-- Append-only change log. knowledge_id is kept (SET NULL) if the row is ever
-- hard-deleted, so the trail survives.
CREATE TABLE IF NOT EXISTS public.ai_knowledge_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_id UUID REFERENCES public.ai_knowledge(id) ON DELETE SET NULL,
  version INTEGER NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'activated', 'deactivated', 'deleted')),
  snapshot JSONB NOT NULL,
  changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_knowledge_history_row
  ON public.ai_knowledge_history (knowledge_id, changed_at DESC);

DROP TRIGGER IF EXISTS set_ai_knowledge_updated_at ON public.ai_knowledge;
CREATE TRIGGER set_ai_knowledge_updated_at
BEFORE UPDATE ON public.ai_knowledge
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.ai_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_knowledge_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_knowledge FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.ai_knowledge_history FROM PUBLIC, anon, authenticated;

COMMIT;

-- Staging verification:
--   SELECT relrowsecurity FROM pg_class WHERE relname IN ('ai_knowledge', 'ai_knowledge_history');
--   SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'ai_knowledge' ORDER BY ordinal_position;
--   SELECT count(*) FROM public.ai_knowledge;
