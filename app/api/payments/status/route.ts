import { NextResponse, type NextRequest } from "next/server";
import { isRateLimited } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/clientIp";
import { verifyAndFinalizePayment } from "@/lib/payments/finalize-flow";
import { loadReceiptByTxRef } from "@/lib/payments/receipt-service";
import { jsonError } from "@/lib/apiResponse";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (await isRateLimited(`payments:status:${ip}`)) return jsonError("Too many requests. Please wait a moment and try again.", 429);

  const payload = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const txRef = typeof payload.txRef === "string" ? payload.txRef.trim() : "";
  if (!txRef) return jsonError("txRef is required.", 400);

  // This performs independent provider verification; possession of txRef
  // alone can never mark a payment as paid.
  const result = await verifyAndFinalizePayment(txRef);
  if (result.outcome === "rejected") {
    if (result.reason === "unknown_tx_ref") return jsonError("We couldn't find that payment.", 404);
    return NextResponse.json({ success: true, status: "failed", reason: result.reason });
  }
  if (result.outcome === "pending") return NextResponse.json({ success: true, status: "pending" });

  // txRef is the scoped hosted-checkout return secret. Only return the one
  // receipt attached to that verified transaction.
  const loaded = await loadReceiptByTxRef(txRef);
  return NextResponse.json({
    success: true,
    status: "paid",
    paymentType: result.paymentType,
    bookingId: result.bookingId,
    receipt: loaded?.receipt || null,
  });
}
