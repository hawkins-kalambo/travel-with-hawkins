import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { logError, logInfo, logWarn } from "@/lib/logger";

export const runtime = "nodejs";

// Vercel Cron sends a plain bearer token, not a hex digest, so this is a
// UTF-8 constant-time compare rather than the PayChangu webhook's
// hex-specific timingSafeHexEqual (app/api/payments/webhook/route.ts).
function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// Flips a lapsed, still-unpaid Booked/Confirmed booking to 'Expired' for
// admin visibility/reporting only — capacity correctness never depends on
// this having run (create_capacity_checked_booking's own reserved-seats
// query already excludes a lapsed booking regardless of its stored status;
// see db/migrations/2026_08_19_web_capacity_and_booking_expiry.sql).
export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") || "";
  const provided = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  if (!expected || !provided || !timingSafeStringEqual(provided, expected)) {
    logWarn("Cron expire-bookings rejected: missing or invalid bearer token");
    return NextResponse.json({ success: false }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin.rpc("expire_overdue_bookings");
  if (error) {
    logError("expire_overdue_bookings failed", { error: error.message });
    return NextResponse.json({ success: false }, { status: 500 });
  }

  const row = Array.isArray(data) ? data[0] : data;
  const expiredCount = typeof row?.expired_count === "number" ? row.expired_count : Number(row?.expired_count ?? 0);
  logInfo("Cron expire-bookings completed", { expiredCount });
  return NextResponse.json({ success: true, expiredCount });
}
