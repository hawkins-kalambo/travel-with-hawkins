// Pure formatting helpers for lib/ambassadorCode.ts, kept in their own
// zero-dependency module (no Supabase import) so they're testable under
// plain `node --test` without needing the @/ path alias or live
// environment variables that lib/supabaseAdmin.ts requires at import time.

/** Derives the 3-letter university code segment used in referral codes. */
export function universityCode(university: string | null | undefined): string {
  const raw = (university || "MZU").replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
  return (raw + "XXX").slice(0, 3);
}

/** Builds a candidate referral code from its parts. */
export function formatReferralCode(uniCode: string, sequence: number): string {
  return `TH-${uniCode}-${String(sequence).padStart(5, "0")}`;
}
