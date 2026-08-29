import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { logError, logInfo } from "@/lib/logger";
import { emailReceiptForPayment } from "@/lib/payments/receipt-service";
import { deliverWhatsAppReceipt } from "@/lib/whatsapp/receipt-delivery";

// Safety net for the receipt outbox: retries rows the finaliser left `pending`
// (crash before the send) or `failed` (transient error), under the DB-side
// attempt cap. `sending` rows — including ambiguous send timeouts — are
// deliberately never auto-retried here; they are left for an admin to resolve.
export async function redriveReceiptDeliveries(limit = 50): Promise<{ candidates: number; delivered: number }> {
  const due = await supabaseAdmin.rpc("due_payment_receipt_deliveries", { p_limit: limit });
  if (due.error) {
    // Migration 2026_09_02 not applied yet — degrade quietly.
    return { candidates: 0, delivered: 0 };
  }
  const rows: Array<{ channel: string; tx_ref: string }> = Array.isArray(due.data) ? due.data : [];
  let delivered = 0;
  for (const row of rows) {
    if (!row.tx_ref) continue;
    try {
      const outcome = row.channel === "whatsapp"
        ? await deliverWhatsAppReceipt(row.tx_ref)
        : await emailReceiptForPayment(row.tx_ref);
      if (outcome === "sent") delivered += 1;
    } catch (error) {
      logError("Receipt re-drive attempt threw", {
        channel: row.channel, error: error instanceof Error ? error.message : "unknown",
      });
    }
  }
  logInfo("Receipt deliveries re-driven", { candidates: rows.length, delivered });
  return { candidates: rows.length, delivered };
}
