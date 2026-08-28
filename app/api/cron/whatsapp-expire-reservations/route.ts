import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAuthorizedCron } from "@/lib/whatsapp/cron";
import { logError, logInfo } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 60;

// Releases WhatsApp reservations whose booking fee is unpaid past the deadline
// (Booked -> Cancelled; capacity is computed and excludes cancelled). Deadlines
// are ALSO enforced inline in create_capacity_checked_booking(), so a missed
// run cannot create an unbounded valid hold — this just tidies up.
export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) return new NextResponse(null, { status: 401 });
  const result = await supabaseAdmin.rpc("expire_whatsapp_reservations");
  if (result.error) {
    logError("WhatsApp reservation expiry failed", { code: result.error.message.slice(0, 120) });
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  const expired = Array.isArray(result.data) ? result.data.length : 0;
  logInfo("WhatsApp reservations expired", { expired });
  return NextResponse.json({ ok: true, expired });
}
