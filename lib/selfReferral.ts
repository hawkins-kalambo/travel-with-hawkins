import { normalizeMalawiPhone } from "./phoneNumbers.ts";

/**
 * Fixes AMB-003 from docs/ambassador-system-audit.md — nothing previously
 * stopped an ambassador from booking a trip with their own referral code
 * and collecting commission on themselves. Matches on phone (primary,
 * since every booking has one) and email (secondary, when both sides have
 * one) after normalizing both to the same format so formatting
 * differences (spacing, +265 vs 0 prefix, casing) can't defeat the check.
 */
export function isSelfReferral(
  bookingPhone: string,
  bookingEmail: string | undefined,
  ambassadorPhone: string | null | undefined,
  ambassadorEmail: string | null | undefined
): boolean {
  const normalizedAmbassadorPhone = normalizeMalawiPhone(ambassadorPhone ?? undefined);
  if (normalizedAmbassadorPhone && normalizedAmbassadorPhone === bookingPhone) {
    return true;
  }

  const normalizedBookingEmail = bookingEmail?.trim().toLowerCase();
  const normalizedAmbassadorEmail = typeof ambassadorEmail === "string" ? ambassadorEmail.trim().toLowerCase() : "";
  if (normalizedBookingEmail && normalizedAmbassadorEmail && normalizedBookingEmail === normalizedAmbassadorEmail) {
    return true;
  }

  return false;
}
