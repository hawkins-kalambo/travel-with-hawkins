"use client";

import { useState } from "react";
import { formatMwk } from "@/lib/routePricing";
import PremiumBoardingPass from "./PremiumBoardingPass";

export type BookingSuccessData = {
  name: string;
  studentId: string;
  phone: string;
  route: string;
  bookingType: "route" | "custom";
  travelDate: string;
  bookingId: string;
  seats: number;
  fare?: number;
  bookingFeeAmount?: number;
};

function formatTravelDate(value: string) {
  if (!value) return "Date to be confirmed";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat("en-MW", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parsed);
}

type BookingSuccessModalProps = {
  successData: BookingSuccessData;
  onClose: () => void;
};

export default function BookingSuccessModal({ successData, onClose }: BookingSuccessModalProps) {
  const [payingFee, setPayingFee] = useState(false);
  const [payError, setPayError] = useState("");

  const handlePayBookingFee = async () => {
    setPayError("");
    setPayingFee(true);
    try {
      const res = await fetch("/api/payments/booking-fee/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: successData.bookingId, contact: successData.phone }),
      });
      const result = await res.json();
      if (result?.success && result.checkoutUrl) {
        window.location.assign(result.checkoutUrl);
        return;
      }
      setPayError(String(result?.error || "Payment could not be started right now. Please try again shortly."));
    } catch {
      setPayError("Network error. Please check your connection and try again.");
    }
    setPayingFee(false);
  };

  return (
    <div className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950/75 px-4 py-6 backdrop-blur-sm sm:py-10" role="dialog" aria-modal="true" aria-labelledby="booking-confirmation-title">
      <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-[28px] bg-[#f8fafc] shadow-[0_32px_90px_rgba(2,8,23,0.38)]">
        <div className="relative overflow-hidden bg-[#0f3f78] px-6 py-7 text-white sm:px-8">
          <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-sky-300/15" />
          <div className="absolute -bottom-24 right-28 h-40 w-40 rounded-full bg-white/5" />
          <button
            onClick={onClose}
            className="absolute right-5 top-5 z-10 grid h-9 w-9 place-items-center rounded-full border border-white/20 bg-white/10 text-xl leading-none text-white transition hover:bg-white/20"
            aria-label="Close booking confirmation"
          >
            ×
          </button>
          <div className="relative flex items-start gap-4 pr-10">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-emerald-400 text-2xl font-black text-[#062e23] shadow-lg shadow-emerald-950/20">✓</div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-sky-200">Booking confirmed</p>
              <h2 id="booking-confirmation-title" className="mt-1 text-2xl font-black sm:text-3xl">You&apos;re ready for your trip</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-blue-100">
                Your seat has been reserved. Keep your booking reference handy when contacting our team.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 p-5 sm:p-8 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="space-y-6">
            <section className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
              <div className="border-b border-blue-100 bg-blue-50/70 px-5 py-4">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0f3f78]">Journey details</p>
              </div>
              <div className="space-y-5 p-5">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Route</p>
                  <div className="mt-2 flex items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#0f3f78] text-sm font-black text-white">A</span>
                    <div className="h-px flex-1 border-t border-dashed border-slate-300" />
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sky-500 text-sm font-black text-white">B</span>
                  </div>
                  <p className="mt-2 text-base font-black text-slate-900">{successData.route}</p>
                </div>
                <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Travel date</p>
                    <p className="mt-1 text-sm font-bold text-slate-900">{formatTravelDate(successData.travelDate)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Seats</p>
                    <p className="mt-1 text-sm font-bold text-slate-900">{successData.seats} reserved</p>
                  </div>
                </div>
              </div>
            </section>

            <PremiumBoardingPass
              name={successData.name}
              studentId={successData.studentId}
              phone={successData.phone}
              destination={successData.route}
              travelDate={successData.travelDate}
              seats={successData.seats}
              bookingId={successData.bookingId}
              bookingType={successData.bookingType}
              fare={successData.fare}
            />
          </div>

          <aside className="space-y-5">
            {successData.bookingFeeAmount != null && successData.bookingFeeAmount > 0 && (
              <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-6 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-800">Booking fee</p>
                  <span className="rounded-full bg-amber-200 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-900">Required</span>
                </div>
                <p className="mt-4 text-3xl font-black tracking-tight text-amber-950">{formatMwk(successData.bookingFeeAmount)}</p>
                <p className="mt-2 text-xs leading-5 text-amber-800">
                  Your seat isn&apos;t fully confirmed until this booking fee is paid. You can pay now or later — your booking reference works either way.
                </p>
                {payError && <p className="mt-3 text-xs font-semibold text-red-700">{payError}</p>}
                <button
                  onClick={handlePayBookingFee}
                  disabled={payingFee}
                  className="mt-4 w-full rounded-xl bg-amber-500 px-6 py-3.5 text-sm font-black text-amber-950 shadow-lg shadow-amber-950/10 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {payingFee ? "Starting payment..." : "Pay Booking Fee Now"}
                </button>
              </div>
            )}

            <div className="rounded-2xl bg-[#071f3d] p-6 text-white shadow-xl shadow-blue-950/15">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-200">Route fare</p>
                <span className="rounded-full bg-amber-400/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-200">Payment pending</span>
              </div>
              <p className="mt-4 text-3xl font-black tracking-tight">
                {successData.fare != null ? formatMwk(successData.fare) : "To be confirmed"}
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-300">
                {successData.fare != null
                  ? "This is the fare assigned to your selected route."
                  : "Our team will confirm the fare for this custom trip."}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">What happens next?</p>
              <ol className="mt-4 space-y-4">
                {[
                  ["1", "Save your reference", "Use it to track your booking at any time."],
                  ["2", "Wait for payment details", "Our team will share payment instructions with you."],
                  ["3", "Arrive ready to travel", "Bring your student ID and booking reference."],
                ].map(([number, title, description]) => (
                  <li key={number} className="flex gap-3">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue-50 text-xs font-black text-[#0f3f78]">{number}</span>
                    <div>
                      <p className="text-sm font-bold text-slate-900">{title}</p>
                      <p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <button onClick={onClose} className="w-full rounded-xl bg-[#0f3f78] px-6 py-3.5 text-sm font-black text-white shadow-lg shadow-blue-950/10 transition hover:bg-[#0a2d56]">
              Done
            </button>
          </aside>
        </div>
      </div>
    </div>
  );
}
