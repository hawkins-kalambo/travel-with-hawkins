"use client";

import { useMemo, useState } from "react";
import { IconX } from "@/app/components/Icon";
import { normalizeMalawiPhone } from "@/lib/phoneNumbers";
import { normalizeBookingRecord } from "@/lib/bookingClientUtils";
import { formatMwk } from "@/lib/routePricing";
import type { BookingSuccessData } from "./BookingSuccessModal";
import type { CarHireListing } from "./CarHireSection";

type CarHireBookingModalProps = {
  listing: CarHireListing;
  onClose: () => void;
  onSuccess: (data: BookingSuccessData) => void;
};

const today = new Date().toISOString().slice(0, 10);

function countDays(pickupDate: string, returnDate: string): number {
  const pickup = new Date(`${pickupDate}T00:00:00Z`);
  const returned = new Date(`${returnDate}T00:00:00Z`);
  const days = Math.round((returned.getTime() - pickup.getTime()) / 86_400_000) + 1;
  return days > 0 ? days : 0;
}

export default function CarHireBookingModal({ listing, onClose, onSuccess }: CarHireBookingModalProps) {
  const [form, setForm] = useState({ name: "", phone: "", email: "", pickupDate: today, returnDate: today });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const days = useMemo(() => countDays(form.pickupDate, form.returnDate), [form.pickupDate, form.returnDate]);
  const isFormValid = Boolean(form.name.trim() && normalizeMalawiPhone(form.phone) && days >= 1);

  const submit = async () => {
    if (!isFormValid) {
      setError("Please fill in your name, a valid phone number, and a valid date range.");
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
          seats: 1,
          travelDate: form.pickupDate,
          rentalEndDate: form.returnDate,
          destination: `${listing.vehicleLabel} - Car Hire`,
          bookingType: "route",
          carHireListingId: listing.id,
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
        route: `${listing.vehicleLabel} - Car Hire (${days} day${days > 1 ? "s" : ""})`,
        bookingType: "route",
        travelDate: form.pickupDate,
        seats: 1,
        bookingId: normalized.bookingId || result.bookingId || "PENDING",
        fare: normalized.fare ?? listing.dailyRate * days,
        bookingFeeAmount: normalized.bookingFeeAmount,
        operatorDisplayName: listing.operatorDisplayName,
      });
    } catch {
      setError("Network error. Please check your connection.");
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950/75 px-4 py-6 backdrop-blur-sm sm:py-10" role="dialog" aria-modal="true" aria-labelledby="car-hire-booking-title">
      <div className="mx-auto w-full max-w-md overflow-hidden rounded-[28px] bg-white shadow-[0_32px_90px_rgba(2,8,23,0.38)]">
        <div className="relative bg-navy-midnight px-6 py-6 text-white">
          <button
            onClick={onClose}
            className="absolute right-5 top-5 grid h-9 w-9 place-items-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange/40"
            aria-label="Close car hire booking"
          >
            <IconX className="h-4 w-4" title="Close" />
          </button>
          <p id="car-hire-booking-title" className="text-xs font-black uppercase tracking-[0.24em] text-orange">Book car hire</p>
          <h2 className="mt-1 text-xl font-black">{listing.vehicleLabel}</h2>
          <p className="mt-1 text-sm text-white/80">
            {formatMwk(listing.dailyRate)}/day · {listing.operatorDisplayName}
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
              <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Pickup date</label>
              <input
                className="input-field mt-1 w-full"
                type="date"
                min={today}
                value={form.pickupDate}
                onChange={(e) => {
                  const pickupDate = e.target.value;
                  setForm((prev) => ({ ...prev, pickupDate, returnDate: prev.returnDate < pickupDate ? pickupDate : prev.returnDate }));
                }}
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Return date</label>
              <input
                className="input-field mt-1 w-full"
                type="date"
                min={form.pickupDate}
                value={form.returnDate}
                onChange={(e) => setForm({ ...form, returnDate: e.target.value })}
              />
            </div>
          </div>

          <button onClick={submit} disabled={loading || !isFormValid} className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60">
            {loading ? "Booking..." : days >= 1 ? `Book for ${formatMwk(listing.dailyRate * days)} (${days} day${days > 1 ? "s" : ""})` : "Select valid dates"}
          </button>
        </div>
      </div>
    </div>
  );
}
