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
 * Falls back to "local" (matching this codebase's prior behavior) when not
 * running behind Vercel's proxy, e.g. local dev — rate limiting there was
 * never the point.
 */
export function getClientIp(request: NextRequest | Request): string {
  return ipAddress(request) || "local";
}
