"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { BookingRecord } from "@/lib/bookingTypes";
import { generateReceiptPdfBlob } from "@/lib/receiptGenerator";

type StatusOutcome = "checking" | "paid" | "pending" | "failed" | "error";

const POLL_INTERVAL_MS = 4000;
const MAX_POLLS = 5;

function ReturnContent() {
  const searchParams = useSearchParams();
  const txRef = searchParams.get("tx_ref") || "";

  const [outcome, setOutcome] = useState<StatusOutcome>(txRef ? "checking" : "error");
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [receiptName, setReceiptName] = useState<string>("receipt.pdf");
  const downloadedRef = useRef(false);
  const pollCountRef = useRef(0);

  useEffect(() => {
    if (!txRef) return;

    let cancelled = false;

    const checkStatus = async () => {
      try {
        const res = await fetch("/api/payments/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ txRef }),
        });
        const result = await res.json();

        if (cancelled) return;

        if (!result?.success) {
          setOutcome("error");
          return;
        }

        if (result.status === "paid") {
          setBookingId(result.bookingId || null);

          const receipt = result.receipt as BookingRecord | null | undefined;
          if (receipt && !downloadedRef.current) {
            downloadedRef.current = true;
            try {
              const pdfBlob = generateReceiptPdfBlob(receipt);
              const url = URL.createObjectURL(pdfBlob);
              const filename = `${receipt.receiptNumber || receipt.bookingId || "receipt"}.pdf`;
              setReceiptUrl(url);
              setReceiptName(filename);

              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = filename;
              anchor.click();
            } catch (e) {
              console.error("Receipt generation failed", e);
            }
          }

          setOutcome("paid");
          return;
        }

        if (result.status === "pending") {
          pollCountRef.current += 1;
          if (pollCountRef.current >= MAX_POLLS) {
            setOutcome("pending");
            return;
          }
          setTimeout(checkStatus, POLL_INTERVAL_MS);
          return;
        }

        setOutcome("failed");
      } catch {
        if (!cancelled) setOutcome("error");
      }
    };

    checkStatus();

    return () => {
      cancelled = true;
    };
  }, [txRef]);

  useEffect(() => {
    return () => {
      if (receiptUrl) URL.revokeObjectURL(receiptUrl);
    };
  }, [receiptUrl]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
        {outcome === "checking" && (
          <>
            <div className="mx-auto mb-5 h-12 w-12 animate-spin rounded-full border-4 border-blue-100 border-t-[#0f3f78]" />
            <h1 className="text-xl font-black text-slate-900">Confirming your payment...</h1>
            <p className="mt-2 text-sm text-slate-600">Please wait while we verify this with our payment provider. Don&apos;t close this page.</p>
          </>
        )}

        {outcome === "paid" && (
          <>
            <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-3xl text-emerald-600">✓</div>
            <h1 className="text-xl font-black text-slate-900">Payment confirmed</h1>
            <p className="mt-2 text-sm text-slate-600">
              {bookingId ? (
                <>
                  Your payment for booking <span className="font-bold text-slate-900">{bookingId}</span> was successful.
                </>
              ) : (
                "Your payment was successful."
              )}
            </p>

            {receiptUrl ? (
              <>
                <p className="mt-3 text-xs text-slate-500">Your receipt has downloaded automatically.</p>
                <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
                  <iframe src={receiptUrl} title="Payment receipt" className="h-72 w-full" />
                </div>
                <a
                  href={receiptUrl}
                  download={receiptName}
                  className="mt-4 inline-block w-full rounded-xl border-2 border-[#0f3f78] px-6 py-3 text-sm font-black text-[#0f3f78] transition hover:bg-slate-50"
                >
                  Download receipt again
                </a>
              </>
            ) : null}

            <Link href="/" className="mt-3 inline-block w-full rounded-xl bg-[#0f3f78] px-6 py-3 text-sm font-black text-white transition hover:bg-[#0a2d56]">
              Back to homepage
            </Link>
          </>
        )}

        {outcome === "pending" && (
          <>
            <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-full bg-amber-100 text-3xl text-amber-600">…</div>
            <h1 className="text-xl font-black text-slate-900">Still processing</h1>
            <p className="mt-2 text-sm text-slate-600">
              Your payment is taking longer than usual to confirm. Use the Track Booking page in a few minutes to check its status.
            </p>
            <Link href="/" className="mt-6 inline-block w-full rounded-xl bg-[#0f3f78] px-6 py-3 text-sm font-black text-white transition hover:bg-[#0a2d56]">
              Back to homepage
            </Link>
          </>
        )}

        {(outcome === "failed" || outcome === "error") && (
          <>
            <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-full bg-red-100 text-3xl text-red-600">×</div>
            <h1 className="text-xl font-black text-slate-900">Payment not completed</h1>
            <p className="mt-2 text-sm text-slate-600">
              We couldn&apos;t confirm this payment. If money left your account, please contact support with your booking ID before trying again.
            </p>
            <Link href="/" className="mt-6 inline-block w-full rounded-xl bg-[#0f3f78] px-6 py-3 text-sm font-black text-white transition hover:bg-[#0a2d56]">
              Back to homepage
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function PaymentReturnPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-100 border-t-[#0f3f78]" />
        </div>
      }
    >
      <ReturnContent />
    </Suspense>
  );
}
