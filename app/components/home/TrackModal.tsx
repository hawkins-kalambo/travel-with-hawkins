"use client";

import Link from "next/link";
import { formatMwk, resolveRouteFareIfAvailable } from "@/lib/routePricing";
import { journeyDirectionLabel, type JourneyDirection } from "@/lib/journeyDirection";

type BookingStatus = "Booked" | "Confirmed" | "Boarding" | "Departed" | "Arrived" | "Completed" | "Cancelled" | string;

type BookingRecord = {
  destination?: string;
  travelDate?: string;
  seats?: number;
  status?: BookingStatus;
  name?: string;
  bookingId?: string;
  tripId?: string;
  phone?: string;
  studentId?: string;
  pickup?: string;
  bookingType?: string;
  receiptNumber?: string;
  fare?: number;
  bookingFeeAmount?: number;
  bookingFeeStatus?: string;
  bookingFeePaidAt?: string;
  fareStatus?: string;
  farePaymentMethod?: string;
  farePaidAt?: string;
  journeyDirection?: JourneyDirection;
  journeyOrigin?: string;
  journeyDestination?: string;
  [key: string]: unknown;
};

const STATUS_ORDER: BookingStatus[] = ["Booked", "Confirmed", "Boarding", "Departed", "Arrived", "Completed"];

function StatusBadge({ status }: { status: BookingStatus }) {
  const s = String(status || "Booked");
  const colors: Record<string, string> = {
    Booked: "bg-amber-50 text-amber-700 border-amber-200",
    Confirmed: "bg-navy/10 text-navy border-navy/20",
    Boarding: "bg-orange-soft text-orange border-orange/30",
    Departed: "border-muted-bluegray/40 bg-muted-bluegray/15 text-navy-secondary",
    Arrived: "bg-navy-secondary/10 text-navy-secondary border-navy-secondary/20",
    Completed: "bg-success/10 text-success border-success/30",
    Cancelled: "bg-red-50 text-red-700 border-red-200",
  };
  return <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${colors[s] ?? colors.Booked}`}>{s}</span>;
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
                <div className={`grid h-8 w-8 place-items-center rounded-full border-2 text-xs font-bold ${active ? "border-navy bg-navy text-white" : "border-slate-200 bg-white text-slate-400"}`}>
                  {active ? "OK" : i + 1}
                </div>
                <span className={`mt-1 max-w-14 text-center text-[10px] leading-tight ${active ? "font-semibold text-navy" : "text-slate-500"}`}>{label}</span>
              </div>
              {i < STATUS_ORDER.length - 1 && <div className={`mx-1 mt-4 h-0.5 flex-1 ${i < activeIndex ? "bg-navy" : "bg-slate-200"}`} />}
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
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-black">Track Booking</h2>
            <p className="text-sm text-slate-600">Enter your Booking ID and the email or phone number you booked with.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200">x</button>
        </div>
        {trackError && <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{trackError}</div>}
        <input className="template-input" placeholder="Enter Booking ID" value={trackId} onChange={(e) => onTrackIdChange(e.target.value)} />
        <input
          className="template-input mt-3"
          placeholder="Email or phone number used when booking"
          value={trackContact}
          onChange={(e) => onTrackContactChange(e.target.value)}
        />
        <button onClick={onTrack} disabled={trackLoading} className="mt-3 w-full rounded-md bg-orange py-3.5 font-black text-white transition hover:bg-orange-hover disabled:bg-slate-300 disabled:hover:bg-slate-300">
          {trackLoading ? "Searching..." : "Check Status"}
        </button>
        {trackResult && (() => {
          const displayFare =
            typeof trackResult.fare === "number" && Number.isFinite(trackResult.fare) && trackResult.fare > 0
              ? trackResult.fare
              : resolveRouteFareIfAvailable(String(trackResult.destination || ""), settingsText);
          const feeSettled = trackResult.bookingFeeStatus === "paid";
          const fareStatus = String(trackResult.fareStatus || "unpaid");
          const fareResolved = fareStatus === "paid" || fareStatus === "cash_collected" || fareStatus === "cash_selected";
          const fullyPaid = feeSettled && (fareStatus === "paid" || fareStatus === "cash_collected");
          const needsAction = !feeSettled || !fareResolved;
          const paymentHref = `/payment?bookingId=${encodeURIComponent(trackResult.bookingId || trackId)}`;

          return (
          <div className="mt-4">
            <StepperTimeline currentStatus={trackResult.status || "Booked"} />
            <div className="mb-3 flex flex-wrap gap-2">
              <StatusBadge status={trackResult.status || "Booked"} />
            </div>

            {needsAction && (
              <div className="mb-3 rounded-md border-2 border-amber-300 bg-amber-50 p-4">
                <p className="text-xs font-black uppercase tracking-wide text-amber-800">
                  {!feeSettled ? "Booking fee not yet paid" : "Transport fare not yet paid"}
                </p>
                <p className="mt-1 text-xs text-amber-700">
                  {!feeSettled
                    ? `Booking fee due: ${trackResult.bookingFeeAmount != null ? formatMwk(trackResult.bookingFeeAmount) : "-"}`
                    : `Fare due: ${displayFare != null ? formatMwk(displayFare) : "Pending"}`}
                </p>
                <Link
                  href={paymentHref}
                  className="mt-3 inline-flex w-full items-center justify-center rounded-md bg-amber-500 py-3 text-sm font-black text-amber-950"
                >
                  Make a Payment
                </Link>
              </div>
            )}

            {!needsAction && fareStatus === "cash_selected" && (
              <div className="mb-3 rounded-md border-2 border-navy/25 bg-navy/5 p-4">
                <p className="text-xs font-black uppercase tracking-wide text-navy">Fare: pay in cash on boarding day</p>
                <p className="mt-1 text-xs text-navy-secondary">Booking fee paid. You&apos;ve chosen to pay the fare in cash when you board.</p>
                <Link
                  href={paymentHref}
                  className="mt-3 inline-flex w-full items-center justify-center rounded-md border-2 border-navy bg-white py-3 text-sm font-black text-navy"
                >
                  Manage Payment
                </Link>
              </div>
            )}

            {fullyPaid && (
              <div className="mb-3 rounded-md border-2 border-emerald-300 bg-emerald-50 p-4">
                <p className="text-xs font-black uppercase tracking-wide text-emerald-800">Booking fee and fare paid</p>
                <Link
                  href={paymentHref}
                  className="mt-3 inline-flex w-full items-center justify-center rounded-md bg-emerald-600 py-3 text-sm font-black text-white"
                >
                  View Payment &amp; Download Receipt
                </Link>
              </div>
            )}

            <div className="space-y-2 rounded-md border border-navy/15 bg-navy/5 p-4 text-sm">
              {[
                ["name", trackResult.name],
                ["status", trackResult.status || "Booked"],
                ["destination", trackResult.destination],
                ["direction", trackResult.journeyDirection ? journeyDirectionLabel(trackResult.journeyDirection) : undefined],
                ["from", trackResult.journeyOrigin],
                ["to", trackResult.journeyDestination],
                ["travelDate", trackResult.travelDate],
                ["seats", trackResult.seats],
                ["bookingType", trackResult.bookingType],
                ["fare", displayFare != null ? formatMwk(displayFare) : "Pending"],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <p className="text-[10px] uppercase text-slate-500">{String(label)}</p>
                  <p className="font-bold">{String(value ?? "-")}</p>
                </div>
              ))}
            </div>
          </div>
          );
        })()}
      </div>
    </div>
  );
}
