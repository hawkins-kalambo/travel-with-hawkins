import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { universityCode, formatReferralCode } from "@/lib/ambassadorCodeFormat";

export { universityCode, formatReferralCode };

// Fixes AMB-022 from docs/ambassador-system-audit.md — referral codes were
// previously generated two different ways depending on how the ambassador
// was created: app/api/applications/review/route.ts already used this
// TH-<UNI>-00001 incrementing format (the one the audit brief assumed was
// standard), while app/api/ambassadors/route.ts (direct admin creation)
// used a cruder SLUG(name)+"01" scheme that always produced the same "01"
// suffix — a guaranteed collision for a second ambassador with the same
// name. This is the one shared implementation both routes now use.

/**
 * Generates a unique ambassador referral code in TH-<UNI>-00001 format.
 * Starts from a count-based sequence number, then probes forward
 * (up to `maxAttempts` times) if a collision is found, backstopped by the
 * real DB UNIQUE constraint on ambassadors.referral_code either way.
 */
export async function generateReferralCode(university: string | null | undefined, maxAttempts = 5): Promise<string> {
  const uniCode = universityCode(university);

  const { data: existing, error: existingErr } = await supabaseAdmin
    .from("ambassadors")
    .select("referral_code")
    .like("referral_code", `TH-${uniCode}-%`);

  if (existingErr) {
    console.warn("Failed to fetch existing ambassadors for code generation", existingErr);
  }

  const startingSequence = (Array.isArray(existing) ? existing.length : 0) + 1;
  let candidate = formatReferralCode(uniCode, startingSequence);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { data: check, error: checkErr } = await supabaseAdmin.from("ambassadors").select("id").eq("referral_code", candidate).maybeSingle();
    if (checkErr) break;
    if (!check) break;
    candidate = formatReferralCode(uniCode, startingSequence + attempt + 1);
  }

  return candidate;
}
