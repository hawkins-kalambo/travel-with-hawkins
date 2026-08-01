"use client";

import { useState } from "react";
import { formatMwk, resolveRouteFareIfAvailable } from "@/lib/routePricing";

type BookingStatus = "Booked" | "Confirmed" | "Boarding" | "Departed" | "Arrived" | "Completed" | "Cancelled" | string;

type BookingRecord = {
  destination?: string;
  travelDate?: string;
  seats?: number;
  status?: BookingStatus;
  name?: string;
  bookingId?: string;
  bookingType?: string;
  paymentStatus?: string;
  fare?: number;
  bookingFeeAmount?: number;
  bookingFeeStatus?: string;
  [key: string]: unknown;
};

const STATUS_ORDER: BookingStatus[] = ["Booked", "Confirmed", "Boarding", "Departed", "Arrived", "Completed"];

function StatusBadge({ status }: { status: BookingStatus }) {
  const s = String(status || "Booked");
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

function PaymentBadge({ status }: { status: string }) {
  const normalized = String(status || "Pending").trim();
  const paid = normalized === "Payment Confirmed" || normalized.toLowerCase() === "paid";
  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${paid ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
      {normalized}
    </span>
  );
}

function StepperTimeline({ currentStatus }: { currentStatus: BookingStatus }) {
  const activeIndex = Math.max(0, STATUS_ORDER.indexOf(currentStatus === "Cancelled" ? "Booked" : currentStatus));
  return (
    <div className="py-4">
      <div className="flex items-start justify-between">
        {STATUS_ORDER.map((label, i) => {
          const active = i <= activeIndex;
          return (
            <div key={label} className="flex flex-1 items-start last:flex-none">
              <div className="flex flex-col items-center">
                <div className={`grid h-8 w-8 place-items-center rounded-full border-2 text-xs font-bold ${active ? "border-[#0f3f78] bg-[#0f3f78] text-white" : "border-slate-200 bg-white text-slate-400"}`}>
                  {active ? "OK" : i + 1}
                </div>
                <span className={`mt-1 max-w-14 text-center text-[10px] leading-tight ${active ? "font-semibold text-[#0f3f78]" : "text-slate-500"}`}>{label}</span>
              </div>
              {i < STATUS_ORDER.length - 1 && <div className={`mx-1 mt-4 h-0.5 flex-1 ${i < activeIndex ? "bg-[#0f3f78]" : "bg-slate-200"}`} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

type TrackModalProps = {
  trackId: string;
  onTrackIdChange: (value: string) => void;
  trackContact: string;
  onTrackContactChange: (value: string) => void;
  trackLoading: boolean;
  trackError: string;
  trackResult: BookingRecord | null;
  settingsText: string | Record<string, unknown>;
  onTrack: () => void;
  onClose: () => void;
};

export default function TrackModal({ trackId, onTrackIdChange, trackContact, onTrackContactChange, trackLoading, trackError, trackResult, settingsText, onTrack, onClose }: TrackModalProps) {
  const [payingFee, setPayingFee] = useState(false);
  const [payError, setPayError] = useState("");

  const handlePayBookingFee = async () => {
    setPayError("");
    setPayingFee(true);
    try {
      const res = await fetch("/api/payments/booking-fee/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: trackId.trim(), contact: trackContact.trim() }),
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
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-black">Track Booking</h2>
            <p className="text-sm text-slate-600">Enter your Booking ID and the email or phone number you booked with.</p>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md bg-slate-100">x</button>
        </div>
        {trackError && <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{trackError}</div>}
        <input className="template-input" placeholder="Enter Booking ID" value={trackId} onChange={(e) => onTrackIdChange(e.target.value)} />
        <input
          className="template-input mt-3"
          placeholder="Email or phone number used when booking"
          value={trackContact}
          onChange={(e) => onTrackContactChange(e.target.value)}
        />
        <button onClick={onTrack} disabled={trackLoading} className="mt-3 w-full rounded-md bg-[#0f3f78] py-3.5 font-black text-white disabled:bg-slate-300">
          {trackLoading ? "Searching..." : "Check Status"}
        </button>
        {trackResult && (
          <div className="mt-4">
            <StepperTimeline currentStatus={trackResult.status || "Booked"} />
            <div className="mb-3 flex flex-wrap gap-2">
              <StatusBadge status={trackResult.status || "Booked"} />
              <PaymentBadge status={String(trackResult.paymentStatus ?? "Pending")} />
            </div>
            {trackResult.bookingFeeAmount != null && trackResult.bookingFeeAmount > 0 && trackResult.bookingFeeStatus !== "paid" && (
              <div className="mb-3 rounded-md border-2 border-amber-300 bg-amber-50 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-black uppercase tracking-wide text-amber-800">Booking fee due</p>
                  <p className="text-lg font-black text-amber-950">{formatMwk(trackResult.bookingFeeAmount)}</p>
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
            <div className="space-y-2 rounded-md border border-blue-100 bg-blue-50 p-4 text-sm">
              {[
                ["name", trackResult.name],
                ["status", trackResult.status || "Booked"],
                ["destination", trackResult.destination],
                ["travelDate", trackResult.travelDate],
                ["seats", trackResult.seats],
                ["bookingType", trackResult.bookingType],
                [
                  "fare",
                  (() => {
                    const displayFare =
                      typeof trackResult.fare === "number" && Number.isFinite(trackResult.fare) && trackResult.fare > 0
                        ? trackResult.fare
                        : resolveRouteFareIfAvailable(String(trackResult.destination || ""), settingsText);
                    return displayFare != null ? formatMwk(displayFare) : "Pending";
                  })(),
                ],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <p className="text-[10px] uppercase text-slate-500">{String(label)}</p>
                  <p className="font-bold">{String(value ?? "-")}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
