import { NextResponse, type NextRequest } from "next/server";
import { getWhatsAppAccountConfig, getWhatsAppWebhookConfig, isWhatsAppBotEnabled, WhatsAppConfigError } from "@/lib/whatsapp/env";
import { verifyMetaSignature } from "@/lib/whatsapp/signature";
import { parseWhatsAppWebhook, partitionEventsByAccount } from "@/lib/whatsapp/parser";
import { storeWebhookEvent } from "@/lib/whatsapp/repository";
import { scheduleWhatsAppProcessing } from "@/lib/whatsapp/processor";
import { logError, logWarn } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token") || "";
  const challenge = url.searchParams.get("hub.challenge") || "";
  try {
    const config = getWhatsAppWebhookConfig();
    if (mode !== "subscribe" || token !== config.verifyToken || !challenge) return new NextResponse(null, { status: 403 });
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  } catch (error) {
    logError("WhatsApp webhook verification unavailable", { reason: error instanceof WhatsAppConfigError ? "missing_env" : "unknown" });
    return new NextResponse(null, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  let config;
  try { config = getWhatsAppWebhookConfig(); }
  catch {
    return NextResponse.json({ success: false, error: "Webhook unavailable" }, { status: 503 });
  }
  if (!verifyMetaSignature(rawBody, req.headers.get("x-hub-signature-256"), config.appSecret)) {
    logWarn("WhatsApp webhook rejected", { reason: "invalid_signature" });
    return NextResponse.json({ success: false, error: "Invalid signature" }, { status: 401 });
  }
  let payload: unknown;
  try { payload = rawBody ? JSON.parse(rawBody) : {}; }
  catch { return NextResponse.json({ success: false, error: "Malformed payload" }, { status: 400 }); }
  // Disabled mode: the challenge and signature are still enforced (above), but
  // nothing is persisted or processed — the request is only acknowledged. This
  // is what lets the webhook be wired up in Meta before the migration is
  // applied or the feature is switched on.
  if (!isWhatsAppBotEnabled()) return NextResponse.json({ success: true, enabled: false });

  // Single-business integration: drop anything whose WhatsApp Business Account
  // ID / phone number ID does not match server configuration before it is
  // persisted. If those identifiers are not configured we cannot validate, so
  // we acknowledge without storing rather than trust the payload.
  let account;
  try {
    account = getWhatsAppAccountConfig();
  } catch {
    logWarn("WhatsApp webhook received but account identifiers are not configured", { action: "acknowledged_without_processing" });
    return NextResponse.json({ success: true, persisted: 0, ignored: "unconfigured" });
  }

  const parsed = parseWhatsAppWebhook(payload);
  const { accepted, rejected } = partitionEventsByAccount(parsed, { wabaId: account.wabaId, phoneNumberId: account.phoneNumberId });
  if (rejected > 0) {
    logWarn("WhatsApp webhook events ignored", { reason: "account_identifier_mismatch", ignored: rejected, accepted: accepted.length });
  }

  try {
    const stored = (await Promise.all(accepted.map(storeWebhookEvent))).filter((event): event is NonNullable<typeof event> => Boolean(event));
    // Acknowledgement (this 200) and persistence (`stored`) are done; message
    // handling and outbound delivery happen in the deferred callback and are
    // not reflected in this response.
    scheduleWhatsAppProcessing(stored.filter((event) => event.processing_status !== "processed").map((event) => event.id));
    return NextResponse.json({ success: true, persisted: stored.length });
  } catch (error) {
    logError("WhatsApp webhook persistence failed", { reason: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ success: false, error: "Temporary error" }, { status: 503 });
  }
}
