"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/auth";

type Booking = {
  bookingId?: string;
  name?: string;
  phone?: string;
  destination?: string;
  travelDate?: string;
  seats?: number;
  serviceType?: string;
  status?: string;
  paymentStatus?: string;
};

function StatusPill({ status }: { status: string | undefined }) {
  const value = status || "unknown";
  const tone =
    value === "Confirmed" || value === "paid"
      ? "bg-green-50 text-green-800"
      : value === "Cancelled" || value === "Expired"
        ? "bg-red-50 text-red-800"
        : value === "Booked" || value === "unpaid" || value === "pending"
          ? "bg-amber-50 text-amber-800"
          : "bg-slate-100 text-slate-700";
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${tone}`}>{value.replace(/_/g, " ")}</span>;
}

// D14: a read-only view of the operator's own bookings, across all three
// service types (bookings.operator_id is set on every insert path — see
// app/api/operators/bookings/route.ts). No status-change/manifest/print
// actions here — those are separate, not-yet-built requirements (D15/D16).
export default function BookingsPanel() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const response = await authFetch("/api/operators/bookings");
      const result = await response.json();
      if (!result.success) {
        setError(result.error || "Failed to load bookings");
        return;
      }
      setBookings(result.bookings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load bookings");
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  return (
    <div className="mt-6 rounded-[28px] border border-slate-200 bg-white p-6 sm:p-8">
      <h2 className="text-lg font-bold text-slate-900">Bookings</h2>
      <p className="mt-1 text-sm text-slate-500">Customers who have booked against your routes, taxi fares, or car-hire listings.</p>

      {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {!loaded && !error && <p className="mt-4 text-sm text-slate-500">Loading…</p>}
      {loaded && bookings.length === 0 && !error && <p className="mt-4 text-sm text-slate-500">No bookings yet.</p>}

      {bookings.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <th className="pb-2 pr-4">Booking</th>
                <th className="pb-2 pr-4">Customer</th>
                <th className="pb-2 pr-4">Destination</th>
                <th className="pb-2 pr-4">Date</th>
                <th className="pb-2 pr-4">Seats</th>
                <th className="pb-2 pr-4">Service</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2">Payment</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((booking) => (
                <tr key={booking.bookingId} className="border-b border-slate-100">
                  <td className="py-3 pr-4 font-mono text-xs text-slate-600">{booking.bookingId}</td>
                  <td className="py-3 pr-4">
                    <div className="font-semibold text-slate-900">{booking.name}</div>
                    <div className="text-xs text-slate-500">{booking.phone}</div>
                  </td>
                  <td className="py-3 pr-4 text-slate-700">{booking.destination}</td>
                  <td className="py-3 pr-4 text-slate-700">{booking.travelDate}</td>
                  <td className="py-3 pr-4 text-slate-700">{booking.seats}</td>
                  <td className="py-3 pr-4 capitalize text-slate-700">{booking.serviceType?.replace(/_/g, " ")}</td>
                  <td className="py-3 pr-4">
                    <StatusPill status={booking.status} />
                  </td>
                  <td className="py-3">
                    <StatusPill status={booking.paymentStatus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
