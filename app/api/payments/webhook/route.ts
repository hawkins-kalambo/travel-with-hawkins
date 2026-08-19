import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getPayChanguEnv, PayChanguConfigError } from "@/lib/payments/env";
import { verifyAndFinalizePayment } from "@/lib/payments/finalize-flow";
import type { PayChanguWebhookPayload } from "@/lib/payments/paychangu-types";
import { logError, logInfo, logWarn } from "@/lib/logger";

export const runtime = "nodejs";

// Implements the algorithm documented in docs/paychangu-phase3-design.md §1.
// This is a server-to-server endpoint authenticated by HMAC signature, not
// a Supabase session — it's excluded from Supabase-auth gating in
// middleware.ts (isPublicPaymentWebhook) and is not rate-limited the way
// guest-facing endpoints are (a legitimate burst of provider deliveries
// must never be dropped; the signature check is the defense here).

const SIGNATURE_HEX_PATTERN = /^[0-9a-f]{64}$/i;

function timingSafeHexEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// Priority: a provider-issued identifier scoped to the specific charge
// (charge_id, then reference) before falling back to tx_ref (which can
// legitimately repeat across more than one event — see the design doc),
// and finally a deterministic hash of stable authenticated fields if even
// tx_ref is absent.
function deriveIdempotencyKey(eventType: string, payload: PayChanguWebhookPayload): string {
  const candidate = payload.charge_id || payload.reference || payload.tx_ref;
  if (candidate && String(candidate).trim()) {
    return `paychangu:${eventType}:${String(candidate).trim()}`;
  }

  const stableFields = [payload.status, payload.currency, payload.amount, payload.created_at].map((value) => (value == null ? "" : String(value))).join("|");
  const hash = createHash("sha256").update(stableFields).digest("hex");
  return `paychangu:${eventType}:hash:${hash}`;
}

async function markEventFailed(eventId: string, reason: string) {
  await supabaseAdmin
    .from("payment_events")
    .update({
      processing_status: "failed",
      last_error_at: new Date().toISOString(),
      last_error: reason.slice(0, 500),
    })
    .eq("id", eventId);
}

// PayChangu's hosted checkout redirects the customer's own BROWSER here via
// a plain GET (?tx_ref=...) once payment completes -- confirmed live in
// production request logs, Referer: checkout.paychangu.com. This route was
// only ever built for the signed server-to-server POST, so every customer
// hit a bare 405 here instead of ever reaching the receipt page, and the
// payment was left unfinalized unless a genuine POST webhook separately
// happened to arrive too. Forward them to the real return page, which
// re-verifies with the provider and finalizes via the same trusted path
// the POST webhook itself uses (lib/payments/finalize-flow.ts) -- this
// never marks anything paid on its own, it's just a redirect.
export async function GET(req: NextRequest) {
  const txRef = req.nextUrl.searchParams.get("tx_ref");
  const destination = txRef ? `/payment/return?tx_ref=${encodeURIComponent(txRef)}` : "/payment/return";
  return NextResponse.redirect(new URL(destination, req.url));
}

export async function POST(req: NextRequest) {
  // 1. Raw bytes — the signature is computed over exactly these, never a
  // re-serialized/parsed version.
  const rawBody = await req.text();

  // 2/3. Read and sanity-check the signature header before any crypto work.
  const signatureHeader = req.headers.get("signature");
  if (!signatureHeader || !SIGNATURE_HEX_PATTERN.test(signatureHeader.trim())) {
    logWarn("PayChangu webhook rejected: missing or malformed Signature header");
    return NextResponse.json({ success: false, error: "Invalid signature" }, { status: 401 });
  }

  let webhookSecret: string;
  try {
    webhookSecret = getPayChanguEnv().webhookSecret;
  } catch (error) {
    logError("PayChangu webhook rejected: provider not configured", {
      reason: error instanceof PayChanguConfigError ? "missing_env" : "unknown",
    });
    return NextResponse.json({ success: false, error: "Payment provider not configured" }, { status: 503 });
  }

  // 4/5/6. HMAC-SHA256 over the raw body, timing-safe comparison, reject
  // before touching JSON at all.
  const computedSignature = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  if (!timingSafeHexEqual(computedSignature, signatureHeader.trim())) {
    logWarn("PayChangu webhook rejected: signature mismatch");
    return NextResponse.json({ success: false, error: "Invalid signature" }, { status: 401 });
  }

  // 7. Only now parse JSON — signature is already confirmed valid.
  let payload: PayChanguWebhookPayload;
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    logError("PayChangu webhook rejected: malformed JSON despite valid signature");
    return NextResponse.json({ success: false, error: "Malformed payload" }, { status: 400 });
  }

  const eventType = typeof payload.event_type === "string" && payload.event_type.trim() ? payload.event_type.trim() : "unknown";
  const txRef = typeof payload.tx_ref === "string" ? payload.tx_ref.trim() : "";

  if (!txRef) {
    logWarn("PayChangu webhook rejected: no tx_ref in payload", { eventType });
    return NextResponse.json({ success: false, error: "Missing tx_ref" }, { status: 400 });
  }

  // 8. Stable event identity for the idempotency key.
  const idempotencyKey = deriveIdempotencyKey(eventType, payload);

  // 9. Insert-or-find the event row (ON CONFLICT DO NOTHING semantics).
  const { data: insertedRows, error: insertError } = await supabaseAdmin
    .from("payment_events")
    .upsert(
      [
        {
          provider: "paychangu",
          event_type: eventType,
          provider_event_id: (payload.charge_id || payload.reference || null) as string | null,
          idempotency_key: idempotencyKey,
          raw_payload: payload,
        },
      ],
      { onConflict: "idempotency_key", ignoreDuplicates: true }
    )
    .select();

  if (insertError) {
    logError("PayChangu webhook: failed to record event", { error: insertError.message });
    return NextResponse.json({ success: false, error: "Temporary error" }, { status: 500 });
  }

  let eventRow: Record<string, unknown>;
  if (insertedRows && insertedRows.length > 0) {
    eventRow = insertedRows[0] as Record<string, unknown>;
  } else {
    const { data: existing, error: fetchError } = await supabaseAdmin.from("payment_events").select("*").eq("idempotency_key", idempotencyKey).single();
    if (fetchError || !existing) {
      logError("PayChangu webhook: event row missing after conflict", { idempotencyKey });
      return NextResponse.json({ success: false, error: "Temporary error" }, { status: 500 });
    }
    eventRow = existing as Record<string, unknown>;
  }

  const eventId = eventRow.id as string;

  // 10. Already fully completed — fast idempotent path, no reprocessing.
  if (eventRow.processing_status === "processed" && eventRow.processed_at) {
    return NextResponse.json({ success: true, message: "Already processed" }, { status: 200 });
  }

  // 11/12. Atomically claim the event so a concurrent delivery (or the
  // browser callback racing the same underlying payment) can't process it
  // twice. If this affects zero rows, someone else already has it.
  const { data: claimedRows, error: claimError } = await supabaseAdmin
    .from("payment_events")
    .update({
      processing_status: "processing",
      processing_started_at: new Date().toISOString(),
      processing_attempts: (Number(eventRow.processing_attempts) || 0) + 1,
    })
    .eq("id", eventId)
    .in("processing_status", ["received", "failed"])
    .select();

  if (claimError) {
    logError("PayChangu webhook: failed to claim event", { error: claimError.message, eventId });
    return NextResponse.json({ success: false, error: "Temporary error" }, { status: 500 });
  }

  if (!claimedRows || claimedRows.length === 0) {
    return NextResponse.json({ success: true, message: "Already being processed" }, { status: 200 });
  }

  // 13/14/15/16. Independent verify → validate → finalize, shared with the
  // browser return route (lib/payments/finalize-flow.ts). finalize_payment
  // marks this payment_events row processed atomically on success (both
  // fresh and already_finalized outcomes) — nothing further to write here.
  //
  // Wrapped so that any unexpected throw (not just the typed rejections
  // verifyAndFinalizePayment normally returns) still moves this event out
  // of 'processing' — otherwise a truly unexpected failure here would leave
  // the event permanently claimed and never retried.
  try {
    const result = await verifyAndFinalizePayment(txRef, eventId);

    if (result.outcome === "pending") {
      await markEventFailed(eventId, `pending:${result.providerStatus || "unknown"}`);
      return NextResponse.json({ success: true, message: "Payment not yet successful" }, { status: 200 });
    }

    if (result.outcome === "rejected") {
      await markEventFailed(eventId, result.reason);
      logWarn("PayChangu webhook: verification/finalization rejected", { txRef, reason: result.reason });
      // Not retryable — a redelivery of the same event will resolve the
      // same way. Acknowledged so PayChangu stops resending it; the
      // payment stays unresolved locally (processing_status = 'failed')
      // for manual reconciliation to pick up if needed.
      return NextResponse.json({ success: true, message: "Rejected" }, { status: 200 });
    }

    logInfo("PayChangu webhook processed", { txRef, outcome: result.outcome, paymentType: result.paymentType });
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    await markEventFailed(eventId, "unexpected_error");
    logError("PayChangu webhook: unexpected error during processing", {
      txRef,
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ success: false, error: "Temporary error" }, { status: 500 });
  }
}
