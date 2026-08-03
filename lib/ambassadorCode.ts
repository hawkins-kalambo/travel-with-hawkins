import { randomInt } from "crypto";
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
 *
 * The sequence number is drawn at random (not incremented 1, 2, 3, ...) —
 * a predictable counter let anyone enumerate every ambassador's code, and
 * via the public /api/referrals/validate endpoint, their real name, just
 * by counting up from TH-<UNI>-00001. Collisions are checked for and
 * re-rolled, backstopped by the real DB UNIQUE constraint on
 * ambassadors.referral_code either way.
 */
export async function generateReferralCode(university: string | null | undefined, maxAttempts = 8): Promise<string> {
  const uniCode = universityCode(university);

  let candidate = formatReferralCode(uniCode, randomInt(1, 100000));

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { data: check, error: checkErr } = await supabaseAdmin.from("ambassadors").select("id").eq("referral_code", candidate).maybeSingle();
    if (checkErr) {
      console.warn("Failed to check referral code candidate for collision", checkErr);
      break;
    }
    if (!check) break;
    candidate = formatReferralCode(uniCode, randomInt(1, 100000));
  }

  return candidate;
}
