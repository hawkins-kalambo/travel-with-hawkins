import { randomUUID } from "crypto";
import { ipAddress } from "@vercel/functions";
import type { NextRequest } from "next/server";

/**
 * Every rate-limit bucket in this app (login, OTP, bookings, applications,
 * payments, referral validation) is keyed partly on client IP. Reading
 * `x-forwarded-for` directly trusts a header the caller sets themselves —
 * varying it per request resets the bucket every time, defeating the limit
 * entirely. `ipAddress()` (from `@vercel/functions`) reads `x-real-ip`,
 * which on Vercel's network is set by Vercel's own proxy from the real TCP
 * connection and overwritten on any client-supplied value, so it can't be
 * spoofed the way a raw forwarded-for header can.
 *
 * When `x-real-ip` is absent (local dev, or any non-Vercel origin), this
 * used to fall back to the literal string "local" for every caller — which
 * collapsed every real client into one shared rate-limit bucket in that
 * situation, letting one attacker's traffic lock out everyone else. A
 * fresh random value per call means an absent trusted header fails open
 * per-caller instead, matching the actual "no rate limiting here" intent.
 */
export function getClientIp(request: NextRequest | Request): string {
  return ipAddress(request) || randomUUID();
}
