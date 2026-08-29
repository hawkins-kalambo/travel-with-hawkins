import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateReceiptPdfBase64, type PaymentReceiptRecord } from "@/lib/receiptGenerator";
import { logWarn } from "@/lib/logger";

const BUCKET = "payment-receipts";

// One immutable PDF per payment id. Generated once from the verified payment
// record and reused for every channel (email, WhatsApp, admin download) and
// every later resend — a subsequent payment on the same booking gets its own
// payment id and therefore its own object; an earlier receipt is never
// rewritten.
export async function getOrCreateReceiptPdf(paymentId: string, receipt: PaymentReceiptRecord): Promise<Uint8Array> {
  const path = `${paymentId}.pdf`;
  const existing = await supabaseAdmin.storage.from(BUCKET).download(path);
  if (!existing.error && existing.data) {
    return new Uint8Array(await existing.data.arrayBuffer());
  }
  const bytes = Buffer.from(generateReceiptPdfBase64(receipt), "base64");
  const uploaded = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, {
    contentType: "application/pdf", upsert: false,
  });
  // A concurrent finaliser may have written it first — treat "already exists"
  // as success and read it back.
  if (uploaded.error && !/exists/i.test(uploaded.error.message)) {
    logWarn("Receipt PDF upload failed; using in-memory copy", { paymentId, error: uploaded.error.message });
  }
  return new Uint8Array(bytes);
}

export function receiptStoragePath(paymentId: string): string {
  return `${paymentId}.pdf`;
}

// Admin download path: fetch the stored PDF, or regenerate + store it if it is
// somehow missing (e.g. the bucket was added after the payment).
export async function loadReceiptPdf(paymentId: string, receipt: PaymentReceiptRecord | null): Promise<Uint8Array | null> {
  const existing = await supabaseAdmin.storage.from(BUCKET).download(`${paymentId}.pdf`);
  if (!existing.error && existing.data) return new Uint8Array(await existing.data.arrayBuffer());
  if (!receipt) return null;
  return getOrCreateReceiptPdf(paymentId, receipt);
}
