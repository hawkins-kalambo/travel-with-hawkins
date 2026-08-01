import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRateLimited } from "@/lib/rateLimit";
import { verifyAndFinalizePayment } from "@/lib/payments/finalize-flow";

export const runtime = "nodejs";

// Public (rate-limited) status check for the browser return page. A tx_ref
// is a 128-bit server-generated random value (see lib/payments/reference.ts)
// known only to us, PayChangu, and whoever the browser was redirected back
// to with it in the URL — the same trust model most hosted-checkout
// providers use for a return-URL session identifier. Possessing it proves
// "this is the browser that just completed (or abandoned) this specific
// checkout", nothing more; it never grants access to any other payment or
// booking data, and the actual payment status still comes from an
// independent PayChangu verification, not from anything the caller claims.
function jsonError(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "local";
  if (isRateLimited(`payments:status:${ip}`)) {
    return jsonError("Too many requests. Please wait a moment and try again.", 429);
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  const txRef = typeof payload.txRef === "string" ? payload.txRef.trim() : "";
  if (!txRef) {
    return jsonError("txRef is required.", 400);
  }

  // Runs the same verify → validate → finalize path the webhook uses (see
  // lib/payments/finalize-flow.ts) — this call can itself complete the
  // payment if the webhook hasn't arrived yet, or safely no-op if it has.
  const result = await verifyAndFinalizePayment(txRef);

  if (result.outcome === "rejected") {
    if (result.reason === "unknown_tx_ref") {
      return jsonError("We couldn't find that payment.", 404);
    }
    return NextResponse.json({ success: true, status: "failed", reason: result.reason });
  }

  if (result.outcome === "pending") {
    return NextResponse.json({ success: true, status: "pending" });
  }

  return NextResponse.json({
    success: true,
    status: "paid",
    paymentType: result.paymentType,
    bookingId: result.bookingId,
  });
}
