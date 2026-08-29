import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyPayChanguTransaction, PayChanguClientError } from "./paychangu-client";
import { validatePayChanguVerification } from "./verification-validator";
import { emailReceiptForPayment, enqueueReceiptDeliveries } from "./receipt-service";
import { logError } from "@/lib/logger";
import { deliverWhatsAppReceipt } from "@/lib/whatsapp/receipt-delivery";

// Shared by the webhook route and the browser return/callback route — both
// are just different triggers for the same "independently verify with
// PayChangu, validate against our own record, then atomically finalize"
// sequence. Keeping it in one place means the two can never drift apart on
// what counts as a valid payment (see docs/paychangu-phase3-design.md §1,
// point 20: "the webhook and the callback for the same payment may
// genuinely race" — finalize_payment's row locking is what makes that safe,
// not anything in this function, but both callers going through the exact
// same verify→validate→finalize code path is what makes them consistent).

export type FinalizeFlowResult =
  | { outcome: "finalized" | "already_finalized"; paymentType: string; bookingId: string; status: string }
  | { outcome: "pending"; providerStatus?: string }
  | { outcome: "rejected"; reason: string };

export async function verifyAndFinalizePayment(txRef: string, paymentEventId: string | null = null): Promise<FinalizeFlowResult> {
  const trimmedTxRef = txRef.trim();
  if (!trimmedTxRef) {
    return { outcome: "rejected", reason: "missing_tx_ref" };
  }

  const { data: paymentRow, error: paymentFetchError } = await supabaseAdmin
    .from("payments")
    .select("internal_reference, payment_type, booking_id, expected_amount, currency, status, paid_amount, provider_reference")
    .eq("internal_reference", trimmedTxRef)
    .maybeSingle();

  if (paymentFetchError || !paymentRow) {
    return { outcome: "rejected", reason: "unknown_tx_ref" };
  }

  // Independent re-verification — nothing about "how we got here" (webhook
  // body, browser query params) is trusted beyond locating this tx_ref.
  let verifyResponse;
  try {
    verifyResponse = await verifyPayChanguTransaction(trimmedTxRef);
  } catch (error) {
    const reason = error instanceof PayChanguClientError ? error.code : "verify_call_failed";
    return { outcome: "rejected", reason };
  }

  const validation = validatePayChanguVerification(verifyResponse, {
    internalReference: paymentRow.internal_reference as string,
    paymentType: paymentRow.payment_type as string,
    bookingId: paymentRow.booking_id as string,
    expectedAmount: paymentRow.expected_amount as number,
    currency: paymentRow.currency as string,
    status: paymentRow.status as string,
    paidAmount: paymentRow.paid_amount as number | null,
    providerReference: paymentRow.provider_reference as string | null,
  });

  if (validation.outcome === "pending") {
    return { outcome: "pending", providerStatus: validation.providerStatus };
  }

  if (validation.outcome === "rejected") {
    return { outcome: "rejected", reason: validation.reason };
  }

  const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc("finalize_payment", {
    p_tx_ref: validation.txRef,
    p_verified_currency: validation.currency,
    p_verified_amount: validation.amount,
    p_provider_reference: validation.providerReference ?? null,
    p_provider_status: null,
    p_payment_event_id: paymentEventId,
  });

  if (rpcError) {
    return { outcome: "rejected", reason: "finalize_rpc_failed" };
  }

  const outcome = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;

  if (!outcome || outcome.outcome === "rejected") {
    return { outcome: "rejected", reason: outcome?.reason || "finalize_rejected" };
  }

  // Durably record that a receipt is owed on each channel BEFORE attempting
  // delivery, so a crash here is recoverable by the re-drive job. Idempotent.
  try {
    await enqueueReceiptDeliveries(trimmedTxRef);
  } catch (error) {
    logError("Receipt delivery enqueue failed", {
      txRef: trimmedTxRef, error: error instanceof Error ? error.message : "unknown",
    });
  }

  // Delivery attempts are best-effort and idempotent (claim-guarded). They
  // must never change the result of a payment PayChangu has already verified
  // and finalized. Anything not delivered here is retried by the re-drive.
  try {
    await emailReceiptForPayment(trimmedTxRef);
  } catch (error) {
    logError("Automatic email receipt delivery failed", {
      txRef: trimmedTxRef, error: error instanceof Error ? error.message : "unknown",
    });
  }

  if (outcome.outcome === "finalized") {
    try {
      await deliverWhatsAppReceipt(trimmedTxRef);
    } catch (error) {
      logError("Automatic WhatsApp receipt delivery failed", {
        bookingId: outcome.booking_id,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  return {
    outcome: outcome.outcome as "finalized" | "already_finalized",
    paymentType: outcome.payment_type as string,
    bookingId: outcome.booking_id as string,
    status: outcome.status as string,
  };
}
