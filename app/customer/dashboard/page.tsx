"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plane,
  CalendarCheck2,
  CheckCircle2,
  XCircle,
  IdCard,
  MapPin,
  CalendarDays,
  Users,
  ArrowUpRight,
  MessageCircle,
  Sparkles,
  Inbox,
} from "lucide-react";
import { getCurrentUser, authFetch } from "@/lib/auth";
import type { CustomerProfile } from "@/lib/customerAuth";
import type { BookingRecord } from "@/lib/bookingTypes";
import CustomerShell from "@/app/customer/_components/CustomerShell";

type InboxPreviewItem = {
  id: string;
  title: string;
  message: string;
  created_at?: string;
  read_at?: string | null;
};

function statusBadgeClasses(status?: string) {
  const normalized = (status || "").toLowerCase();
  if (normalized === "completed") return "bg-emerald-50 text-emerald-700 border border-emerald-200";
  if (normalized === "cancelled") return "bg-red-50 text-red-700 border border-red-200";
  if (normalized === "boarding" || normalized === "departed" || normalized === "arrived") return "bg-amber-50 text-amber-700 border border-amber-200";
  return "bg-blue-50 text-blue-700 border border-blue-200";
}

export default function CustomerDashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [inboxPreview, setInboxPreview] = useState<InboxPreviewItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [linkedBookingsMessage, setLinkedBookingsMessage] = useState("");

  useEffect(() => {
    const initializeUser = async () => {
      try {
        const currentUser = await getCurrentUser();

        if (!currentUser) {
          router.push("/customer/login");
          return;
        }

        const profileRes = await fetch("/api/customers/profile", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });

        if (profileRes.ok) {
          const profileData = await profileRes.json();
          if (profileData.success && profileData.profile) {
            setProfile(profileData.profile);
          }
        }

        const bookingsRes = await fetch("/api/customers/bookings");
        if (bookingsRes.ok) {
          const bookingsData = await bookingsRes.json();
          if (bookingsData.bookings) {
            setBookings(bookingsData.bookings);
          }
        }

        const linkRes = await fetch("/api/customers/link-guest-bookings", { method: "POST" });
        if (linkRes.ok) {
          const linkData = await linkRes.json();
          if (linkData.success && linkData.linkedCount && linkData.linkedCount > 0) {
            setLinkedBookingsMessage(
              `Great! We found and linked ${linkData.linkedCount} previous booking(s) to your account.`
            );
          }
        }

        const commsRes = await authFetch("/api/communications");
        if (commsRes.ok) {
          const commsData = await commsRes.json();
          if (commsData.success) {
            const notifications: InboxPreviewItem[] = Array.isArray(commsData.notifications) ? commsData.notifications : [];
            setInboxPreview(notifications.slice(0, 4));
            setUnreadCount(notifications.filter((item) => !item.read_at).length);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    };

    initializeUser();
  }, [router]);

  const { upcomingBookings, completedBookings, cancelledBookings } = useMemo(() => {
    const now = new Date();
    return {
      upcomingBookings: bookings.filter((b) => {
        const travelDate = new Date(b.travelDate || "");
        return travelDate >= now && b.status !== "Cancelled";
      }),
      completedBookings: bookings.filter((b) => b.status === "Completed"),
      cancelledBookings: bookings.filter((b) => b.status === "Cancelled"),
    };
  }, [bookings]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f3f7fb]">
        <div className="text-center">
          <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-[#0A4D8C] mx-auto"></div>
          <p className="text-slate-600">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  const firstName = profile?.fullName?.split(" ")[0] || "there";

  return (
    <CustomerShell active="dashboard" profile={profile} unreadCount={unreadCount} title="Dashboard" subtitle="Your travel activity at a glance">
      {error && (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {linkedBookingsMessage && (
        <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{linkedBookingsMessage}</div>
      )}

      {/* Welcome hero */}
      <div className="relative mb-8 overflow-hidden rounded-[28px] border border-slate-200 bg-gradient-to-r from-[#0A4D8C] via-[#0d5aa3] to-[#0A4D8C] p-7 text-white shadow-lg shadow-[#0A4D8C]/15 sm:p-9">
        <Sparkles className="pointer-events-none absolute -right-6 -top-8 h-40 w-40 text-white/10" strokeWidth={1} />
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-white/60">Welcome back</p>
        <h1 className="mt-2 text-3xl font-black sm:text-4xl">Hello, {firstName}</h1>
        <p className="mt-2 max-w-xl text-base text-white/80">
          {profile?.customerType === "student"
            ? "Ready for your next trip? Book now or check your upcoming journeys."
            : "Plan your next adventure with us. Browse, book, and enjoy!"}
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:gap-4">
          <Link
            href="/book"
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#F7931E] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-black/10 transition hover:bg-[#e67e0f]"
          >
            <Plane size={17} strokeWidth={2.25} />
            Book a Trip
          </Link>
          <Link
            href="/customer/messages"
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/30 bg-white/5 px-6 py-3 text-sm font-bold text-white transition hover:bg-white/15"
          >
            <Inbox size={17} strokeWidth={2.25} />
            View Messages
            {unreadCount > 0 ? (
              <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-white px-1 text-[11px] font-bold text-[#0A4D8C]">
                {unreadCount}
              </span>
            ) : null}
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Upcoming Trips", value: upcomingBookings.length, icon: CalendarCheck2, tint: "from-blue-50 to-blue-100 text-blue-700" },
          { label: "Completed Trips", value: completedBookings.length, icon: CheckCircle2, tint: "from-emerald-50 to-emerald-100 text-emerald-700" },
          { label: "Cancelled Trips", value: cancelledBookings.length, icon: XCircle, tint: "from-red-50 to-red-100 text-red-700" },
          { label: "Customer ID", value: profile?.customerNumber || "—", icon: IdCard, tint: "from-amber-50 to-amber-100 text-amber-700" },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md">
              <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${stat.tint}`}>
                <Icon size={20} strokeWidth={2.25} />
              </div>
              <div className={`font-black text-slate-900 ${typeof stat.value === "string" ? "truncate text-lg" : "text-3xl"}`} title={typeof stat.value === "string" ? stat.value : undefined}>
                {stat.value}
              </div>
              <p className="mt-1 text-sm font-semibold text-slate-500">{stat.label}</p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-8 xl:grid-cols-[1.65fr_1fr]">
        <div className="space-y-8">
          {/* Upcoming Trips */}
          <section id="trips">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-black text-slate-900">Upcoming Trips</h2>
              <Link href="/book" className="inline-flex items-center gap-1 text-sm font-semibold text-[#0A4D8C] hover:text-[#083a6b]">
                Book another <ArrowUpRight size={14} />
              </Link>
            </div>

            {upcomingBookings.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
                <Plane className="mx-auto mb-3 h-9 w-9 text-slate-300" strokeWidth={1.5} />
                <p className="text-slate-600">No upcoming trips scheduled. Time to book your next adventure!</p>
                <Link
                  href="/book"
                  className="mt-4 inline-block rounded-2xl bg-[#0A4D8C] px-6 py-3 text-sm font-semibold text-white hover:bg-[#083a6b]"
                >
                  Book a Trip
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {upcomingBookings.map((booking) => (
                  <div
                    key={booking.bookingId}
                    className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md"
                  >
                    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                      <div>
                        <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                          <MapPin size={17} className="text-[#0A4D8C]" strokeWidth={2.25} />
                          {booking.destination}
                        </h3>
                        <p className="mt-1.5 flex items-center gap-1.5 text-sm text-slate-600">
                          <CalendarDays size={15} className="text-slate-400" />
                          {new Date(booking.travelDate || "").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                        </p>
                        <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
                          <IdCard size={15} className="text-slate-400" />
                          Booking ID: {booking.bookingId}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`inline-block rounded-full px-3.5 py-1.5 text-xs font-bold ${statusBadgeClasses(booking.status)}`}>
                          {booking.status}
                        </span>
                        <Link
                          href={`/customer/bookings/${booking.bookingId}`}
                          className="inline-flex items-center gap-1 rounded-2xl bg-[#0A4D8C] px-4 py-2 text-xs font-bold text-white hover:bg-[#083a6b]"
                        >
                          View Details
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* All Bookings */}
          <section id="bookings">
            <h2 className="mb-4 text-xl font-black text-slate-900">All Bookings</h2>

            {bookings.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
                <p className="text-slate-600">You haven&apos;t made any bookings yet.</p>
                <Link
                  href="/book"
                  className="mt-4 inline-block rounded-2xl bg-[#0A4D8C] px-6 py-3 text-sm font-semibold text-white hover:bg-[#083a6b]"
                >
                  Book Your First Trip
                </Link>
              </div>
            ) : (
              <>
                {/* Card list on narrow screens — a 6-column table can't fit a phone width */}
                <div className="space-y-3 sm:hidden">
                  {bookings.map((booking) => (
                    <div key={booking.bookingId} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900">{booking.destination}</p>
                          <p className="mt-0.5 text-xs text-slate-500">{booking.bookingId}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${statusBadgeClasses(booking.status)}`}>
                          {booking.status}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
                        <span>{new Date(booking.travelDate || "").toLocaleDateString()}</span>
                        <span className="inline-flex items-center gap-1">
                          <Users size={14} className="text-slate-400" />
                          {booking.seats || 1}
                        </span>
                      </div>
                      <Link
                        href={`/customer/bookings/${booking.bookingId}`}
                        className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[#0A4D8C] hover:text-[#083a6b]"
                      >
                        View details <ArrowUpRight size={14} />
                      </Link>
                    </div>
                  ))}
                </div>

                {/* Table on sm+ screens */}
                <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white sm:block">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-slate-200 bg-slate-50">
                        <tr>
                          <th className="px-6 py-4 text-left font-semibold text-slate-700">Booking ID</th>
                          <th className="px-6 py-4 text-left font-semibold text-slate-700">Route</th>
                          <th className="px-6 py-4 text-left font-semibold text-slate-700">Date</th>
                          <th className="px-6 py-4 text-left font-semibold text-slate-700">Seats</th>
                          <th className="px-6 py-4 text-left font-semibold text-slate-700">Status</th>
                          <th className="px-6 py-4 text-left font-semibold text-slate-700">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bookings.map((booking) => (
                          <tr key={booking.bookingId} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
                            <td className="px-6 py-4 font-semibold text-slate-900">{booking.bookingId}</td>
                            <td className="px-6 py-4 text-slate-600">{booking.destination}</td>
                            <td className="px-6 py-4 text-slate-600">{new Date(booking.travelDate || "").toLocaleDateString()}</td>
                            <td className="px-6 py-4 text-slate-600">
                              <span className="inline-flex items-center gap-1">
                                <Users size={14} className="text-slate-400" />
                                {booking.seats || 1}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${statusBadgeClasses(booking.status)}`}>
                                {booking.status}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <Link
                                href={`/customer/bookings/${booking.bookingId}`}
                                className="inline-flex items-center gap-1 text-sm font-semibold text-[#0A4D8C] hover:text-[#083a6b]"
                              >
                                View <ArrowUpRight size={14} />
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>

        {/* Inbox preview sidebar */}
        <aside className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-base font-black text-slate-900">
                <MessageCircle size={18} className="text-[#0A4D8C]" strokeWidth={2.25} />
                Inbox
              </h2>
              {unreadCount > 0 ? (
                <span className="rounded-full bg-[#F7931E]/10 px-2.5 py-1 text-xs font-bold text-[#F7931E]">{unreadCount} new</span>
              ) : null}
            </div>

            {inboxPreview.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm text-slate-500">
                No messages yet. We&apos;ll notify you here when our team reaches out.
              </div>
            ) : (
              <ul className="space-y-3">
                {inboxPreview.map((item) => (
                  <li key={item.id} className={`rounded-xl border p-3.5 ${item.read_at ? "border-slate-200 bg-white" : "border-[#0A4D8C]/20 bg-[#f6fbff]"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900 line-clamp-1">{item.title}</p>
                      {!item.read_at ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#F7931E]" /> : null}
                    </div>
                    <p className="mt-1 text-xs text-slate-500 line-clamp-2">{item.message}</p>
                  </li>
                ))}
              </ul>
            )}

            <Link
              href="/customer/messages"
              className="mt-4 flex items-center justify-center gap-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-[#0A4D8C] hover:bg-slate-50"
            >
              Open full inbox <ArrowUpRight size={14} />
            </Link>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-[#0A4D8C] to-[#083a6b] p-5 text-white shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-white/60">Need help?</p>
            <p className="mt-2 text-sm text-white/85">
              Message our support team anytime from your inbox — we typically reply within a few hours.
            </p>
            <Link
              href="/customer/messages"
              className="mt-4 inline-flex items-center gap-1 rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20"
            >
              Contact support <ArrowUpRight size={14} />
            </Link>
          </div>
        </aside>
      </div>
    </CustomerShell>
  );
}
