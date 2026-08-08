"use client";

import { useState } from "react";

import { canRescheduleJourney } from "@/lib/bookingLifecycle";
import type { BookingRecord } from "@/lib/bookingTypes";
import { journeyDirectionLabel } from "@/lib/journeyDirection";

type BookingDetailsPanelProps = {
  booking: BookingRecord;
  universityName?: string;
  isViewer: boolean;
  rescheduling: boolean;
  history: BookingAuditEntry[];
  historyLoading: boolean;
  onClose: () => void;
  onReschedule: (travelDate: string) => Promise<boolean>;
};

export type BookingAuditEntry = {
  id: string;
  actor_role?: string | null;
  action: string;
  metadata?: Record<string, unknown> | null;
  created_at: string;
};

function valueOrDash(value: unknown) {
  return typeof value === "string" && value.trim() ? value : "—";
}

function formatMoney(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `MWK ${value.toLocaleString()}` : "—";
}

function Detail({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

export default function BookingDetailsPanel({
  booking,
  universityName,
  isViewer,
  rescheduling,
  history,
  historyLoading,
  onClose,
  onReschedule,
}: BookingDetailsPanelProps) {
  const [travelDate, setTravelDate] = useState(booking.travelDate ?? "");
  const [error, setError] = useState("");
  const fareTotal = typeof booking.fare === "number" ? booking.fare * (booking.seats || 1) : undefined;
  const today = new Date().toISOString().slice(0, 10);

  const submitReschedule = async () => {
    setError("");
    if (!travelDate) {
      setError("Select a new travel date.");
      return;
    }
    const success = await onReschedule(travelDate);
    if (!success) setError("The booking could not be rescheduled. Check the date and try again.");
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40" role="dialog" aria-modal="true" aria-label="Booking details">
      <button className="absolute inset-0 cursor-default" onClick={onClose} aria-label="Close booking details" />
      <aside className="relative h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-2xl sm:p-7">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-600">Booking details</p>
            <h3 className="mt-1 font-mono text-xl font-bold text-primary-900">{valueOrDash(booking.bookingId)}</h3>
            <p className="mt-1 text-sm text-slate-500">Trip {valueOrDash(booking.tripId)}</p>
          </div>
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            Close
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <Detail label="Passenger" value={valueOrDash(booking.name)} />
          <Detail label="Student ID" value={valueOrDash(booking.studentId)} />
          <Detail label="Phone" value={valueOrDash(booking.phone)} />
          <Detail label="Email" value={valueOrDash(booking.email)} />
          <Detail label="Destination" value={valueOrDash(booking.destination)} />
          <Detail label="Direction" value={booking.journeyDirection ? journeyDirectionLabel(booking.journeyDirection) : "—"} />
          <Detail label="Journey origin" value={valueOrDash(booking.journeyOrigin)} />
          <Detail label="Journey destination" value={valueOrDash(booking.journeyDestination)} />
          <Detail label="Home district" value={valueOrDash(booking.homeDistrict)} />
          <Detail label="Campus" value={universityName || "—"} />
          <Detail label="Pickup" value={valueOrDash(booking.pickup || booking.location)} />
          <Detail label="Travel date" value={valueOrDash(booking.travelDate)} />
          <Detail label="Seats" value={booking.seats || 1} />
          <Detail label="Journey status" value={valueOrDash(booking.status)} />
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 p-4">
          <h4 className="font-bold text-primary-900">Payment summary</h4>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Detail label="Booking fee" value={formatMoney(booking.bookingFeeAmount)} />
            <Detail label="Fee status" value={valueOrDash(booking.bookingFeeStatus)} />
            <Detail label="Transport fare" value={formatMoney(fareTotal)} />
            <Detail label="Fare status" value={valueOrDash(booking.fareStatus)} />
            <Detail label="Fare method" value={valueOrDash(booking.farePaymentMethod)} />
            <Detail label="Receipt" value={booking.receiptSent ? "Sent" : "Not sent"} />
          </div>
          {booking.paymentNotes ? <p className="mt-3 text-sm text-slate-600">Notes: {booking.paymentNotes}</p> : null}
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 p-4">
          <h4 className="font-bold text-primary-900">Activity history</h4>
          {historyLoading ? (
            <p className="mt-3 text-sm text-slate-500">Loading history...</p>
          ) : history.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No recorded admin changes yet.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {history.map((entry) => {
                const label = entry.action.split("_").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
                const reason = typeof entry.metadata?.cancellationReason === "string" ? entry.metadata.cancellationReason : "";
                return (
                  <div key={entry.id} className="border-l-2 border-primary-200 pl-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-900">{label}</p>
                      <time className="text-[10px] text-slate-500">{new Date(entry.created_at).toLocaleString()}</time>
                    </div>
                    <p className="text-xs text-slate-500">By {entry.actor_role || "system"}</p>
                    {reason ? <p className="mt-1 text-xs text-slate-700">Reason: {reason}</p> : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {!isViewer && canRescheduleJourney(booking.status) ? (
          <div className="mt-6 rounded-2xl border border-[#d7ebff] bg-[#eef6ff] p-4">
            <h4 className="font-bold text-primary-900">Reschedule journey</h4>
            <p className="mt-1 text-xs text-slate-600">The booking will move to the trip generated for the new date.</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                type="date"
                min={today}
                value={travelDate}
                onChange={(event) => setTravelDate(event.target.value)}
                className="input-field flex-1"
              />
              <button
                onClick={() => void submitReschedule()}
                disabled={rescheduling || !travelDate || travelDate === booking.travelDate}
                className="rounded-xl bg-primary-700 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-800 disabled:opacity-50"
              >
                {rescheduling ? "Rescheduling..." : "Save new date"}
              </button>
            </div>
            {error ? <p className="mt-2 text-xs font-medium text-danger">{error}</p> : null}
          </div>
        ) : null}
      </aside>
    </div>
  );
}
