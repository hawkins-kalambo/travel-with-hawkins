"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { formatMwk } from "@/lib/currency";
import { generateReceiptPdfBlob } from "@/lib/receiptGenerator";
import type { BookingRecord } from "@/lib/bookingTypes";

function StatusBadge({ status }: { status: string }) {
  const s = status || "Booked";
  const colors: Record<string, string> = {
    Booked: "bg-amber-50 text-amber-700 border-amber-200",
    Confirmed: "bg-blue-50 text-blue-700 border-blue-200",
    Boarding: "bg-sky-50 text-sky-700 border-sky-200",
    Departed: "bg-sky-50 text-sky-700 border-sky-200",
    Arrived: "bg-cyan-50 text-cyan-700 border-cyan-200",
    Completed: "bg-blue-50 text-blue-700 border-blue-200",
    Cancelled: "bg-red-50 text-red-700 border-red-200",
  };
  return <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${colors[s] ?? colors.Booked}`}>{s}</span>;
}

function PaymentContent() {
  const searchParams = useSearchParams();

  const [bookingId, setBookingId] = useState("");
  const [contact, setContact] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<BookingRecord | null>(null);

  const [payingFee, setPayingFee] = useState(false);
  const [payError, setPayError] = useState("");
  const [payingFare, setPayingFare] = useState(false);
  const [fareError, setFareError] = useState("");
  const [selectingCash, setSelectingCash] = useState(false);
  const [cashError, setCashError] = useState("");

  useEffect(() => {
    const prefillTimer = window.setTimeout(() => {
      const prefill = searchParams.get("bookingId");
      if (prefill) setBookingId(prefill);
    }, 0);

    return () => window.clearTimeout(prefillTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = async () => {
    setError("");
    setResult(null);
    if (!bookingId.trim()) return setError("Please enter a Booking ID.");
    if (!contact.trim()) return setError("Please enter the email or phone number used when booking.");
    setLoading(true);
    try {
      const res = await fetch("/api/track-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: bookingId.trim(), contact: contact.trim() }),
      });
      const json = await res.json();
      if (json?.success && json.booking) setResult(json.booking);
      else setError(String(json?.error || "Booking not found."));
    } catch {
      setError("Network error. Please try again.");
    }
    setLoading(false);
  };

  const handlePayBookingFee = async () => {
    setPayError("");
    setPayingFee(true);
    try {
      const res = await fetch("/api/payments/booking-fee/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: bookingId.trim(), contact: contact.trim() }),
      });
      const json = await res.json();
      if (json?.success && json.checkoutUrl) {
        window.location.assign(json.checkoutUrl);
        return;
      }
      setPayError(String(json?.error || "Payment could not be started right now. Please try again shortly."));
    } catch {
      setPayError("Network error. Please check your connection and try again.");
    }
    setPayingFee(false);
  };

  const handlePayFareOnline = async () => {
    setFareError("");
    setPayingFare(true);
    try {
      const res = await fetch("/api/payments/fare/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: bookingId.trim(), contact: contact.trim() }),
      });
      const json = await res.json();
      if (json?.success && json.checkoutUrl) {
        window.location.assign(json.checkoutUrl);
        return;
      }
      setFareError(String(json?.error || "Payment could not be started right now. Please try again shortly."));
    } catch {
      setFareError("Network error. Please check your connection and try again.");
    }
    setPayingFare(false);
  };

  const handleSelectCashFare = async () => {
    setCashError("");
    setSelectingCash(true);
    try {
      const res = await fetch("/api/payments/fare/select-cash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: bookingId.trim(), contact: contact.trim() }),
      });
      const json = await res.json();
      if (json?.success) {
        await handleSearch();
        return;
      }
      setCashError(String(json?.error || "Could not save your choice right now. Please try again shortly."));
    } catch {
      setCashError("Network error. Please check your connection and try again.");
    }
    setSelectingCash(false);
  };

  const handleDownloadReceipt = (paymentType: "booking_fee" | "transport_fare") => {
    if (!result) return;
    const displayFare =
      typeof result.fare === "number" && Number.isFinite(result.fare) && result.fare > 0 ? result.fare : undefined;

    const receiptBooking: BookingRecord = {
      ...result,
      fare: displayFare,
      paymentStatus: paymentType === "booking_fee" ? "Booking Fee Paid" : "Transport Fare Paid",
      paymentConfirmedAt: paymentType === "booking_fee" ? result.bookingFeePaidAt : result.farePaidAt,
    };

    try {
      const pdfBlob = generateReceiptPdfBlob(receiptBooking);
      const url = URL.createObjectURL(pdfBlob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${result.receiptNumber || result.bookingId || "receipt"}.pdf`;
      // target="_blank" so mobile Safari / in-app webviews that ignore the
      // download attribute open the PDF in a new tab instead of navigating
      // this page away to an unrenderable blob: URL (see app/payment/return
      // for the full incident this pattern caused).
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Receipt generation failed", err);
    }
  };

  const displayFare =
    result && typeof result.fare === "number" && Number.isFinite(result.fare) && result.fare > 0 ? result.fare : undefined;
  const feeSettled = result?.bookingFeeStatus === "paid";
  const fareStatus = String(result?.fareStatus || "unpaid");
  const fareSettled = fareStatus === "paid" || fareStatus === "cash_collected";

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-xl">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-black text-[#0f3f78]">Make a Payment</h1>
          <p className="mt-2 text-sm text-slate-600">Pay your booking fee or bus fare — no account needed.</p>
        </div>

        <div className="rounded-lg bg-white p-6 shadow-sm">
          <h2 className="text-lg font-black">Already booked? Find your booking</h2>
          <p className="mt-1 text-sm text-slate-600">Enter your Booking ID and the email or phone number you booked with.</p>

          {error && <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

          <input
            className="template-input mt-3"
            placeholder="Enter Booking ID"
            value={bookingId}
            onChange={(e) => setBookingId(e.target.value)}
          />
          <input
            className="template-input mt-3"
            placeholder="Email or phone number used when booking"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
          />
          <button
            onClick={handleSearch}
            disabled={loading}
            className="mt-3 w-full rounded-md bg-[#0f3f78] py-3.5 font-black text-white disabled:bg-slate-300"
          >
            {loading ? "Searching..." : "Find My Booking"}
          </button>

          {result && (
            <div className="mt-5 border-t border-slate-100 pt-5">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <StatusBadge status={result.status || "Booked"} />
                <span className="text-sm font-bold text-slate-700">{result.destination}</span>
              </div>

              {result.bookingFeeAmount != null && result.bookingFeeAmount > 0 && !feeSettled && (
                <div className="mb-3 rounded-md border-2 border-amber-300 bg-amber-50 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-black uppercase tracking-wide text-amber-800">Booking fee due</p>
                    <p className="text-lg font-black text-amber-950">{formatMwk(result.bookingFeeAmount)}</p>
                  </div>
                  {payError && <p className="mt-2 text-xs font-semibold text-red-700">{payError}</p>}
                  <button
                    onClick={handlePayBookingFee}
                    disabled={payingFee}
                    className="mt-3 w-full rounded-md bg-amber-500 py-3 text-sm font-black text-amber-950 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {payingFee ? "Starting payment..." : "Pay Booking Fee Now"}
                  </button>
                </div>
              )}

              {feeSettled && !fareSettled && fareStatus !== "cash_selected" && (
                <div className="mb-3 rounded-md border-2 border-sky-300 bg-sky-50 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-black uppercase tracking-wide text-sky-800">Transport fare due</p>
                    <p className="text-lg font-black text-sky-950">{displayFare != null ? formatMwk(displayFare) : "Pending"}</p>
                  </div>
                  <p className="mt-1 text-xs text-sky-700">Pay online now, or wait and pay in cash on your travel day.</p>
                  {fareError && <p className="mt-2 text-xs font-semibold text-red-700">{fareError}</p>}
                  {cashError && <p className="mt-2 text-xs font-semibold text-red-700">{cashError}</p>}
                  <button
                    onClick={handlePayFareOnline}
                    disabled={payingFare || selectingCash}
                    className="mt-3 w-full rounded-md bg-sky-600 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {payingFare ? "Starting payment..." : "Pay Fare Online Now"}
                  </button>
                  <button
                    onClick={handleSelectCashFare}
                    disabled={payingFare || selectingCash}
                    className="mt-2 w-full rounded-md border-2 border-sky-600 bg-white py-3 text-sm font-black text-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {selectingCash ? "Saving..." : "Pay in Cash on Boarding Day"}
                  </button>
                </div>
              )}

              {feeSettled && !fareSettled && fareStatus === "cash_selected" && (
                <div className="mb-3 rounded-md border-2 border-sky-300 bg-sky-50 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-black uppercase tracking-wide text-sky-800">Fare: pay on boarding day</p>
                    <p className="text-lg font-black text-sky-950">{displayFare != null ? formatMwk(displayFare) : "Pending"}</p>
                  </div>
                  <p className="mt-1 text-xs text-sky-700">You&apos;ve chosen to pay this in cash when you board. Changed your mind?</p>
                  {fareError && <p className="mt-2 text-xs font-semibold text-red-700">{fareError}</p>}
                  <button
                    onClick={handlePayFareOnline}
                    disabled={payingFare}
                    className="mt-3 w-full rounded-md bg-sky-600 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {payingFare ? "Starting payment..." : "Pay Fare Online Instead"}
                  </button>
                </div>
              )}

              {fareSettled && (
                <div className="mb-3 rounded-md border-2 border-emerald-300 bg-emerald-50 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-black uppercase tracking-wide text-emerald-800">Transport fare paid</p>
                    <p className="text-lg font-black text-emerald-950">{displayFare != null ? formatMwk(displayFare) : "-"}</p>
                  </div>
                  <button
                    onClick={() => handleDownloadReceipt("transport_fare")}
                    className="mt-3 w-full rounded-md bg-emerald-600 py-3 text-sm font-black text-white"
                  >
                    Download Receipt
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-6 rounded-lg bg-white p-6 text-center shadow-sm">
          <h2 className="text-lg font-black">Haven&apos;t booked yet?</h2>
          <p className="mt-1 text-sm text-slate-600">Start a new booking and pay your fee once it&apos;s confirmed.</p>
          <Link
            href="/?openBooking=1"
            className="mt-4 inline-flex w-full items-center justify-center rounded-md bg-[#0f3f78] py-3.5 text-sm font-black text-white"
          >
            Book a Trip
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function PaymentPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-100 border-t-[#0f3f78]" />
        </div>
      }
    >
      <PaymentContent />
    </Suspense>
  );
}
