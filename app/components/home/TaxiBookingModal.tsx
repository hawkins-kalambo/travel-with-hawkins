"use client";

import { useState } from "react";
import { IconX } from "@/app/components/Icon";
import { normalizeMalawiPhone } from "@/lib/phoneNumbers";
import { normalizeBookingRecord } from "@/lib/bookingClientUtils";
import { formatMwk } from "@/lib/currency";
import type { BookingSuccessData } from "./BookingSuccessModal";
import type { TaxiFare } from "./TaxiSection";

type TaxiBookingModalProps = {
  fare: TaxiFare;
  onClose: () => void;
  onSuccess: (data: BookingSuccessData) => void;
};

const today = new Date().toISOString().slice(0, 10);

export default function TaxiBookingModal({ fare, onClose, onSuccess }: TaxiBookingModalProps) {
  const [form, setForm] = useState({ name: "", phone: "", email: "", seats: 1, travelDate: today });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isFormValid = Boolean(form.name.trim() && normalizeMalawiPhone(form.phone) && form.seats >= 1 && form.travelDate.trim());

  const submit = async () => {
    if (!isFormValid) {
      setError("Please fill in your name, a valid phone number, and a travel date.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          email: form.email || undefined,
          seats: form.seats,
          travelDate: form.travelDate,
          destination: `${fare.originLabel} - ${fare.destinationLabel}`,
          bookingType: "route",
          taxiFareId: fare.id,
        }),
      });
      const result = await res.json();
      if (!result?.success) {
        setError(String(result?.error || "Booking failed. Please try again."));
        setLoading(false);
        return;
      }

      const normalized = normalizeBookingRecord(result.booking ?? {});
      onSuccess({
        name: form.name,
        studentId: "",
        phone: form.phone,
        route: `${fare.originLabel} - ${fare.destinationLabel}`,
        bookingType: "route",
        travelDate: form.travelDate,
        seats: form.seats,
        bookingId: normalized.bookingId || result.bookingId || "PENDING",
        fare: normalized.fare ?? fare.fare,
        bookingFeeAmount: normalized.bookingFeeAmount,
        operatorDisplayName: fare.operatorDisplayName,
      });
    } catch {
      setError("Network error. Please check your connection.");
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950/75 px-4 py-6 backdrop-blur-sm sm:py-10" role="dialog" aria-modal="true" aria-labelledby="taxi-booking-title">
      <div className="mx-auto w-full max-w-md overflow-hidden rounded-[28px] bg-white shadow-[0_32px_90px_rgba(2,8,23,0.38)]">
        <div className="relative bg-navy-midnight px-6 py-6 text-white">
          <button
            onClick={onClose}
            className="absolute right-5 top-5 grid h-9 w-9 place-items-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange/40"
            aria-label="Close taxi booking"
          >
            <IconX className="h-4 w-4" title="Close" />
          </button>
          <p id="taxi-booking-title" className="text-xs font-black uppercase tracking-[0.24em] text-orange">Book taxi</p>
          <h2 className="mt-1 text-xl font-black">
            {fare.originLabel} → {fare.destinationLabel}
          </h2>
          <p className="mt-1 text-sm text-white/80">
            {formatMwk(fare.fare)} · {fare.operatorDisplayName}
          </p>
        </div>

        <div className="space-y-4 p-6">
          {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Full name</label>
            <input className="input-field mt-1 w-full" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Phone number</label>
            <input className="input-field mt-1 w-full" placeholder="0999 123 456" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Email (optional)</label>
            <input className="input-field mt-1 w-full" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Travel date</label>
              <input
                className="input-field mt-1 w-full"
                type="date"
                min={today}
                value={form.travelDate}
                onChange={(e) => setForm({ ...form, travelDate: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Seats</label>
              <input
                className="input-field mt-1 w-full"
                type="number"
                min={1}
                max={10}
                value={form.seats}
                onChange={(e) => setForm({ ...form, seats: Number(e.target.value) || 1 })}
              />
            </div>
          </div>

          <button onClick={submit} disabled={loading || !isFormValid} className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60">
            {loading ? "Booking..." : `Book for ${formatMwk(fare.fare * form.seats)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
