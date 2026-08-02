// Pure logic for capturing and persisting a referral code across page
// navigation/refresh (fixes AMB-001 from docs/ambassador-system-audit.md —
// today nothing persists a referral code at all, so a customer who clicks
// an ambassador's link and then navigates anywhere loses attribution).
//
// Kept dependency-free (no localStorage calls here) so it's testable
// without a browser environment — the caller (app/page.tsx) owns the
// actual localStorage.getItem/setItem/removeItem calls.

export const REFERRAL_STORAGE_KEY = "twh_referral";
export const REFERRAL_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const CODE_PATTERN = /^[A-Z0-9_-]+$/;

export type StoredReferral = { code: string; capturedAt: number };
export type ReferralSource = "link" | "manual";

export function sanitizeReferralCode(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().toUpperCase();
  return trimmed && CODE_PATTERN.test(trimmed) ? trimmed : undefined;
}

export function serializeStoredReferral(code: string, capturedAt: number): string {
  return JSON.stringify({ code, capturedAt } satisfies StoredReferral);
}

export function parseStoredReferral(raw: string | null | undefined, now: number): StoredReferral | null {
  if (!raw) return null;

  let parsed: Partial<StoredReferral>;
  try {
    parsed = JSON.parse(raw) as Partial<StoredReferral>;
  } catch {
    return null;
  }

  const code = sanitizeReferralCode(parsed.code);
  const capturedAt = typeof parsed.capturedAt === "number" && Number.isFinite(parsed.capturedAt) ? parsed.capturedAt : undefined;
  if (!code || capturedAt === undefined) return null;
  if (now - capturedAt > REFERRAL_TTL_MS || now < capturedAt) return null;

  return { code, capturedAt };
}

export type ResolvedReferral = {
  code: string;
  source: ReferralSource;
  /** Set when the caller should persist this back to storage (a fresh ?ref= was seen). */
  nextStoredValue?: string;
};

/**
 * Last-click-wins attribution: an explicit ?ref= on the current page
 * always overwrites whatever was previously stored. Absent that, a
 * non-expired previously-stored code is reused so attribution survives
 * navigation and refreshes.
 */
export function resolveInitialReferral(options: { urlCode?: string | null; storedRaw?: string | null; now?: number }): ResolvedReferral | null {
  const now = options.now ?? Date.now();
  const urlCode = sanitizeReferralCode(options.urlCode);

  if (urlCode) {
    return { code: urlCode, source: "link", nextStoredValue: serializeStoredReferral(urlCode, now) };
  }

  const stored = parseStoredReferral(options.storedRaw, now);
  if (stored) {
    return { code: stored.code, source: "link" };
  }

  return null;
}
