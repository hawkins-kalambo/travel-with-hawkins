"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getCurrentUser, logout } from "@/lib/auth";
import type { CustomerProfile } from "@/lib/customerAuth";
import type { BookingRecord } from "@/lib/bookingTypes";

export default function CustomerDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [linkedBookingsMessage, setLinkedBookingsMessage] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const initializeUser = async () => {
      try {
        const currentUser = await getCurrentUser();

        if (!currentUser) {
          router.push("/customer/login");
          return;
        }

        setUser(currentUser);

        // Load customer profile
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

        // Load customer bookings
        const bookingsRes = await fetch("/api/bookings?customerId=" + currentUser.id);
        if (bookingsRes.ok) {
          const bookingsData = await bookingsRes.json();
          if (bookingsData.bookings) {
            setBookings(bookingsData.bookings);
          }
        }

        // Try to link guest bookings
        const linkRes = await fetch("/api/customers/link-guest-bookings", { method: "POST" });
        if (linkRes.ok) {
          const linkData = await linkRes.json();
          if (linkData.success && linkData.linkedCount && linkData.linkedCount > 0) {
            setLinkedBookingsMessage(
              `Great! We found and linked ${linkData.linkedCount} previous booking(s) to your account.`
            );
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

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-[#0A4D8C] mx-auto"></div>
          <p className="text-slate-600">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  const upcomingBookings = bookings.filter((b) => {
    const travelDate = new Date(b.travelDate || "");
    return travelDate >= new Date() && b.status !== "Cancelled";
  });

  const completedBookings = bookings.filter((b) => b.status === "Completed");
  const cancelledBookings = bookings.filter((b) => b.status === "Cancelled");

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <Image src="/logo.png" width={40} height={40} className="rounded-full object-cover" alt="Travel with Hawkins" />
              <span className="text-lg font-black text-[#0A4D8C]">Travel with Hawkins</span>
            </Link>

            <nav className="hidden items-center gap-8 md:flex">
              <a href="#bookings" className="text-sm font-semibold text-slate-700 hover:text-[#0A4D8C]">
                My Bookings
              </a>
              <a href="#trips" className="text-sm font-semibold text-slate-700 hover:text-[#0A4D8C]">
                My Trips
              </a>
              <Link href="/customer/profile" className="text-sm font-semibold text-slate-700 hover:text-[#0A4D8C]">
                Profile
              </Link>
            </nav>

            <div className="flex items-center gap-4">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="relative flex items-center gap-3 rounded-full border border-slate-200 px-4 py-2 hover:bg-slate-50"
              >
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#0A4D8C] to-[#F7931E]"></div>
                <span className="hidden text-sm font-semibold text-slate-700 sm:inline">{profile?.fullName?.split(" ")[0] || "You"}</span>

                {menuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-48 rounded-2xl border border-slate-200 bg-white shadow-lg">
                    <Link
                      href="/customer/profile"
                      className="block px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 rounded-t-2xl"
                    >
                      My Profile
                    </Link>
                    <Link
                      href="/customer/settings"
                      className="block px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Settings
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="w-full text-left px-4 py-3 text-sm font-semibold text-red-600 hover:bg-slate-50 rounded-b-2xl"
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {linkedBookingsMessage && (
          <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
            {linkedBookingsMessage}
          </div>
        )}

        {/* Welcome Section */}
        <div className="mb-8 rounded-[28px] border border-slate-200 bg-gradient-to-r from-[#0A4D8C] to-[#0f3f78] p-6 text-white sm:p-8">
          <h1 className="text-3xl font-black sm:text-4xl">Welcome back, {profile?.fullName?.split(" ")[0]}! 👋</h1>
          <p className="mt-2 text-base text-slate-100/90">
            {profile?.customerType === "student" 
              ? "Ready for your next trip? Book now or check your upcoming journeys."
              : "Plan your next adventure with us. Browse, book, and enjoy!"}
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:gap-4">
            <Link
              href="/book"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#F7931E] px-6 py-3 text-sm font-semibold text-white hover:bg-[#e67e0f] transition"
            >
              ✈️ Book a Trip
            </Link>
            <Link
              href="/customer/profile"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/30 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10 transition"
            >
              ⚙️ Edit Profile
            </Link>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="text-3xl font-black text-[#0A4D8C]">{upcomingBookings.length}</div>
            <p className="mt-2 text-sm font-semibold text-slate-600">Upcoming Trips</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="text-3xl font-black text-[#0A4D8C]">{completedBookings.length}</div>
            <p className="mt-2 text-sm font-semibold text-slate-600">Completed Trips</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="text-3xl font-black text-[#0A4D8C]">{cancelledBookings.length}</div>
            <p className="mt-2 text-sm font-semibold text-slate-600">Cancelled Trips</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="text-3xl font-black text-[#0A4D8C]">{profile?.customerNumber || "—"}</div>
            <p className="mt-2 text-sm font-semibold text-slate-600">Customer ID</p>
          </div>
        </div>

        {/* Upcoming Trips Section */}
        <section id="trips" className="mb-8">
          <h2 className="mb-4 text-2xl font-black text-slate-900">Upcoming Trips</h2>

          {upcomingBookings.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
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
                <div key={booking.bookingId} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md transition">
                  <div className="flex flex-col justify-between sm:flex-row sm:items-center">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">{booking.destination}</h3>
                      <p className="mt-1 text-sm text-slate-600">
                        📅 {new Date(booking.travelDate || "").toLocaleDateString()}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">🎫 Booking ID: {booking.bookingId}</p>
                    </div>
                    <div className="mt-4 flex gap-2 sm:mt-0">
                      <span className="inline-block rounded-full bg-blue-100 px-4 py-2 text-xs font-semibold text-blue-700">
                        {booking.status}
                      </span>
                      <Link
                        href={`/customer/bookings/${booking.bookingId}`}
                        className="inline-block rounded-2xl bg-[#0A4D8C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#083a6b]"
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

        {/* All Bookings Section */}
        <section id="bookings">
          <h2 className="mb-4 text-2xl font-black text-slate-900">All Bookings</h2>

          {bookings.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
              <p className="text-slate-600">You haven't made any bookings yet.</p>
              <Link
                href="/book"
                className="mt-4 inline-block rounded-2xl bg-[#0A4D8C] px-6 py-3 text-sm font-semibold text-white hover:bg-[#083a6b]"
              >
                Book Your First Trip
              </Link>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
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
                      <tr key={booking.bookingId} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-6 py-4 font-semibold text-slate-900">{booking.bookingId}</td>
                        <td className="px-6 py-4 text-slate-600">{booking.destination}</td>
                        <td className="px-6 py-4 text-slate-600">
                          {new Date(booking.travelDate || "").toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-slate-600">{booking.seats || 1}</td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${
                              booking.status === "Completed"
                                ? "bg-green-100 text-green-700"
                                : booking.status === "Cancelled"
                                ? "bg-red-100 text-red-700"
                                : "bg-blue-100 text-blue-700"
                            }`}
                          >
                            {booking.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <Link
                            href={`/customer/bookings/${booking.bookingId}`}
                            className="text-sm font-semibold text-[#0A4D8C] hover:text-[#083a6b]"
                          >
                            View →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
