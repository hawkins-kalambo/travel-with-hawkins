"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  MapPin,
  CalendarDays,
  IdCard,
  Users,
  Phone,
  Route as RouteIcon,
  Receipt,
  ArrowLeft,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import type { CustomerProfile } from "@/lib/customerAuth";
import type { BookingRecord } from "@/lib/bookingTypes";
import { journeyDirectionLabel, isJourneyDirection } from "@/lib/journeyDirection";
import CustomerShell from "@/app/customer/_components/CustomerShell";
import StatusBadge from "@/app/customer/_components/StatusBadge";

function valueOrDash(value: unknown) {
  return typeof value === "string" && value.trim() ? value : "—";
}

function formatMoney(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `MWK ${value.toLocaleString()}` : "—";
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

export default function CustomerBookingDetailPage() {
  const params = useParams();
  const bookingId = params?.bookingId as string | undefined;
  const router = useRouter();
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [booking, setBooking] = useState<BookingRecord | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      if (!bookingId) {
        setBooking(null);
        setLoading(false);
        return;
      }

      try {
        const currentUser = await getCurrentUser();
        if (!currentUser) {
          router.push("/customer/login");
          return;
        }

        const profileRes = await fetch("/api/customers/profile");
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          if (profileData.success && profileData.profile) {
            setProfile(profileData.profile);
          }
        }

        const bookingsRes = await fetch(`/api/customers/bookings?bookingId=${encodeURIComponent(bookingId)}`);
        if (bookingsRes.ok) {
          const bookingsData = await bookingsRes.json();
          setBooking(bookingsData.booking ?? null);
        } else {
          setBooking(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load booking");
        setBooking(null);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [bookingId, router]);

  if (loading || booking === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f3f7fb]">
        <div className="text-center">
          <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-[#0A4D8C] mx-auto"></div>
          <p className="text-slate-600">Loading booking...</p>
        </div>
      </div>
    );
  }

  if (!booking) {
    return (
      <CustomerShell active="bookings" profile={profile} title="Booking not found">
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <IdCard className="mx-auto mb-3 h-9 w-9 text-slate-300" strokeWidth={1.5} />
          <h2 className="text-lg font-bold text-slate-900">We couldn&apos;t find that booking</h2>
          <p className="mt-2 text-sm text-slate-600">
            It may not exist, or it isn&apos;t linked to your account.
          </p>
          <Link
            href="/customer/dashboard"
            className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-[#0A4D8C] px-6 py-3 text-sm font-semibold text-white hover:bg-[#083a6b]"
          >
            <ArrowLeft size={16} /> Back to Dashboard
          </Link>
        </div>
      </CustomerShell>
    );
  }

  const fareTotal = typeof booking.fare === "number" ? booking.fare * (booking.seats || 1) : undefined;

  return (
    <CustomerShell active="bookings" profile={profile} title="Booking Details" subtitle={`Booking ${booking.bookingId ?? ""}`}>
      {error && (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      <Link
        href="/customer/dashboard"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-[#0A4D8C] hover:text-[#083a6b]"
      >
        <ArrowLeft size={15} /> Back to Dashboard
      </Link>

      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
              <IdCard size={14} /> {valueOrDash(booking.bookingId)}
            </p>
            <h1 className="mt-2 flex items-center gap-2.5 text-2xl font-black text-slate-900">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-[#0A4D8C]">
                <MapPin size={18} strokeWidth={2.25} />
              </span>
              {valueOrDash(booking.destination)}
            </h1>
            <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-600">
              <CalendarDays size={15} className="text-slate-400" />
              {booking.travelDate
                ? new Date(booking.travelDate).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })
                : "—"}
            </p>
          </div>
          <div className="h-fit">
            <StatusBadge status={valueOrDash(booking.status)} />
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Detail label="Passenger" value={valueOrDash(booking.name)} />
          <Detail label="Student ID" value={valueOrDash(booking.studentId)} />
          <Detail label="Phone" value={valueOrDash(booking.phone)} />
          <Detail label="Email" value={valueOrDash(booking.email)} />
          <Detail
            label="Direction"
            value={isJourneyDirection(booking.journeyDirection) ? journeyDirectionLabel(booking.journeyDirection) : "—"}
          />
          <Detail label="Journey origin" value={valueOrDash(booking.journeyOrigin)} />
          <Detail label="Journey destination" value={valueOrDash(booking.journeyDestination)} />
          <Detail label="Home district" value={valueOrDash(booking.homeDistrict)} />
          <Detail label="Pickup point" value={valueOrDash(booking.pickup || booking.location)} />
          <Detail
            label="Seats"
            value={
              <span className="inline-flex items-center gap-1.5">
                <Users size={14} className="text-slate-400" />
                {booking.seats || 1}
              </span>
            }
          />
          <Detail label="Trip" value={valueOrDash(booking.tripId)} />
          <Detail label="Booked on" value={booking.createdAt ? new Date(booking.createdAt).toLocaleDateString() : "—"} />
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 p-5">
          <h2 className="flex items-center gap-2 font-bold text-slate-900">
            <Receipt size={17} className="text-[#0A4D8C]" /> Payment summary
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Detail label="Booking fee" value={formatMoney(booking.bookingFeeAmount)} />
            <Detail label="Fee status" value={valueOrDash(booking.bookingFeeStatus)} />
            <Detail label="Transport fare" value={formatMoney(fareTotal)} />
            <Detail label="Fare status" value={valueOrDash(booking.fareStatus)} />
            <Detail label="Payment method" value={valueOrDash(booking.farePaymentMethod)} />
            <Detail label="Receipt" value={booking.receiptSent ? "Sent" : "Not sent"} />
          </div>
          {booking.paymentNotes ? <p className="mt-3 text-sm text-slate-600">Notes: {booking.paymentNotes}</p> : null}
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <h2 className="flex items-center gap-2 font-bold text-slate-900">
            <RouteIcon size={17} className="text-[#0A4D8C]" /> Need help with this booking?
          </h2>
          <p className="mt-1.5 text-sm text-slate-600">
            Message our support team if anything looks wrong or if you need to make a change.
          </p>
          <Link
            href="/customer/messages"
            className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-[#0A4D8C] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#083a6b]"
          >
            <Phone size={15} /> Contact support
          </Link>
        </div>
      </div>
    </CustomerShell>
  );
}
