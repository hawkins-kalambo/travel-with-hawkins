import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAuthorizedCron } from "@/lib/whatsapp/cron";
import { processWhatsAppEvent } from "@/lib/whatsapp/processor";
import { logError, logInfo, logWarn } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 60;

// Re-drives WhatsApp webhook events left stuck by an interrupted after()
// callback. recover_whatsapp_webhook_events() (db/migrations/2026_08_11_*)
// resets stale claims and returns re-processable ids under the attempt cap;
// events already `processed` are never returned, so a message whose handling
// failed after persistence is not auto-replayed.
export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) return new NextResponse(null, { status: 401 });

  const result = await supabaseAdmin.rpc("recover_whatsapp_webhook_events", { p_max_attempts: 5, p_stale_minutes: 15 });
  if (result.error) {
    // The 2026_08_11 migration may not be applied yet — degrade quietly.
    logWarn("WhatsApp event recovery unavailable", { code: result.error.message.slice(0, 120) });
    return NextResponse.json({ ok: true, skipped: "recovery_function_unavailable" });
  }

  const ids: string[] = (Array.isArray(result.data) ? result.data : [])
    .map((row: { event_id?: string }) => row.event_id)
    .filter((id): id is string => Boolean(id));

  let processed = 0;
  for (const id of ids) {
    try { await processWhatsAppEvent(id); processed += 1; }
    catch (error) {
      logError("WhatsApp recovery reprocess failed", { code: error instanceof Error ? error.message.slice(0, 120) : "unknown" });
    }
  }
  logInfo("WhatsApp events recovered", { candidates: ids.length, processed });
  return NextResponse.json({ ok: true, candidates: ids.length, processed });
}
