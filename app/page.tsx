"use client";

import { useState } from "react";
import Image from "next/image";

const API_URL = "https://script.google.com/macros/s/AKfycby17HHcmR3G_8GhP7wdb3pvkcZpnAy6R0mtH8W7qrkcRuu5JiEQy4FIRkEDQ81KFk_L/exec";

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);

  const [selectedRoute, setSelectedRoute] = useState("");
  const [bookingType, setBookingType] = useState<"route" | "custom">("custom");

  const [showBooking, setShowBooking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: "",
    studentId: "",
    phone: "",
    seats: 1,
    travelDate: new Date().toISOString().split("T")[0],
  });

  const [customDestination, setCustomDestination] = useState("");

  const [successData, setSuccessData] = useState<{
    name: string;
    studentId: string;
    phone: string;
    route: string;
    bookingType: "route" | "custom";
    date: string;
    bookingId: string;
    tripId: string;
    seats: number;
  } | null>(null);

  const [showTrack, setShowTrack] = useState(false);
  const [trackId, setTrackId] = useState("");
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackError, setTrackError] = useState("");
  type TrackResult = {
    name?: string;
    status?: string;
    destination?: string;
    travelDate?: string;
    seats?: number;
    tripId?: string;
    [key: string]: unknown;
  };

  const [trackResult, setTrackResult] = useState<TrackResult | null>(null);

  // ================= VALIDATION =================
  const isFormValid = () => {
    return (
      form.name.trim() &&
      form.studentId.trim() &&
      form.phone.trim() &&
      form.seats >= 1 &&
      String(form.travelDate).trim()
    );
  };

  // ================= BOOKING =================
  const handleBooking = async () => {
    setError("");

    if (!isFormValid()) {
      setError("Please fill all fields");
      return;
    }

    if (loading) return;

    const isCustom = bookingType === "custom";

    if (isCustom && !customDestination.trim()) {
      setError("Please enter your destination");
      return;
    }

    setLoading(true);

    const destination = isCustom ? customDestination : selectedRoute;

    const data = {
      name: form.name.trim(),
      studentId: form.studentId.trim(),
      phone: form.phone.trim(),
      destination,
      travelDate: form.travelDate,
      seats: form.seats,
      pickup: "Mzuzu University",
      location: "Campus",
      bookingType,
    };

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        body: JSON.stringify(data),
      });

      const result = await res.json();

      if (result.success) {
        setSuccessData({
          name: form.name,
          studentId: form.studentId,
          phone: form.phone,
          route: isCustom ? customDestination : selectedRoute,
          bookingType,
          date: form.travelDate,
          bookingId: result.bookingId || "PENDING",
          tripId: result.tripId || "PENDING",
          seats: form.seats,
        });

        setForm((prev) => ({ ...prev, name: "", studentId: "", phone: "", seats: 1 }));
        setSelectedRoute("");
        setCustomDestination("");
        setBookingType("custom");
        setShowBooking(false);
      } else {
        setError(result.error || "Booking failed. Please try again.");
      }
    } catch {
      setError("Network error. Please check your connection.");
    }

    setLoading(false);
  };

  return (
    <main className="bg-slate-50 min-h-screen text-gray-900">

      {/* ================= NAVBAR ================= */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white border-b shadow-sm">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex justify-between items-center h-16">

            <div className="flex items-center gap-3">
              <Image src="/logo.png" width={48} height={48} className="object-contain" alt="Travel with Hawkins Logo" />
              <div>
                <h1 className="text-lg font-bold text-blue-900">
                  Travel with Hawkins
                </h1>
                <p className="text-[10px] text-gray-500">
                  Safe Journeys • Trusted Service
                </p>
              </div>
            </div>

            <div className="hidden md:flex items-center gap-6 text-sm font-medium">

              <a href="#" className="hover:text-blue-900">Home</a>
              <a href="#routes" className="hover:text-blue-900">Routes</a>
              <a href="#how" className="hover:text-blue-900">How It Works</a>
              <a href="#footer" className="hover:text-blue-900">Contact</a>

              <button
                onClick={() => {
                  setSelectedRoute("");
                  setBookingType("custom");
                  setShowBooking(true);
                }}
                className="bg-orange-500 hover:bg-orange-600 text-white px-5 py-2 rounded-xl shadow-md"
              >
                Book Now
              </button>

              <button
                onClick={() => setShowTrack(true)}
                className="bg-blue-900 hover:bg-blue-800 text-white px-4 py-2 rounded-xl shadow-md"
              >
                Track Booking
              </button>

            </div>

            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="md:hidden text-2xl"
            >
              ☰
            </button>

          </div>
        </div>
      </nav>

      {menuOpen ? (
        <div className="md:hidden bg-white border-b shadow-sm">
          <div className="px-4 py-4 space-y-3">
            <a
              href="#"
              onClick={() => setMenuOpen(false)}
              className="block text-base font-medium text-blue-900 hover:text-blue-700"
            >
              Home
            </a>
            <a
              href="#routes"
              onClick={() => setMenuOpen(false)}
              className="block text-base font-medium text-blue-900 hover:text-blue-700"
            >
              Routes
            </a>
            <a
              href="#how"
              onClick={() => setMenuOpen(false)}
              className="block text-base font-medium text-blue-900 hover:text-blue-700"
            >
              How It Works
            </a>
            <a
              href="#footer"
              onClick={() => setMenuOpen(false)}
              className="block text-base font-medium text-blue-900 hover:text-blue-700"
            >
              Contact
            </a>
            <button
              onClick={() => {
                setSelectedRoute("");
                setBookingType("custom");
                setShowBooking(true);
                setMenuOpen(false);
              }}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white px-4 py-3 rounded-xl text-sm font-semibold"
            >
              Book Now
            </button>
            <button
              onClick={() => {
                setShowTrack(true);
                setMenuOpen(false);
              }}
              className="w-full bg-blue-900 hover:bg-blue-800 text-white px-4 py-3 rounded-xl text-sm font-semibold"
            >
              Track Booking
            </button>
          </div>
        </div>
      ) : null}

      {/* ================= HERO ================= */}
      <section className="pt-28 pb-16 bg-linear-to-b from-white to-slate-50">
        <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center gap-10">

          <div className="flex-1">

            <p className="text-blue-700 font-semibold tracking-wide">
              🚐 Premium Student Transport System
            </p>

            <h1 className="text-4xl md:text-5xl font-extrabold text-blue-950 mt-3 leading-tight">
              Safe, Reliable & Smart Travel Between Campus and Home
            </h1>

            <p className="text-gray-600 mt-5 text-lg">
              Book verified student routes or request personalized transport anywhere in Malawi — fast, secure, and trusted.
            </p>

            <div className="flex gap-3 mt-7 flex-col sm:flex-row">

              <button
                onClick={() => {
                  setSelectedRoute("");
                  setBookingType("custom");
                  setShowBooking(true);
                }}
                className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-xl shadow-lg"
              >
                Book Your Seat
              </button>

              <button
                onClick={() =>
                  document.getElementById("routes")?.scrollIntoView()
                }
                className="border border-blue-900 text-blue-900 px-6 py-3 rounded-xl hover:bg-blue-50"
              >
                Explore Routes
              </button>

            </div>

          </div>

          <div className="flex-1">
            <Image
              src="/hero.png"
              width={600}
              height={450}
              className="rounded-2xl shadow-2xl w-full object-cover"
              alt="Premium Student Transport Service"
            />
          </div>

        </div>
      </section>

      {/* ================= TRUST ================= */}
      <section className="py-10 bg-white border-y">
        <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 text-center">

          <div>
            <h3 className="text-2xl font-bold text-blue-900">500+</h3>
            <p className="text-sm text-gray-600">Students Served</p>
          </div>

          <div>
            <h3 className="text-2xl font-bold text-blue-900">10+</h3>
            <p className="text-sm text-gray-600">Routes</p>
          </div>

          <div>
            <h3 className="text-2xl font-bold text-blue-900">95%</h3>
            <p className="text-sm text-gray-600">On-Time Rate</p>
          </div>

          <div>
            <h3 className="text-2xl font-bold text-blue-900">24/7</h3>
            <p className="text-sm text-gray-600">Support</p>
          </div>

        </div>
      </section>

      {/* ================= WHY CHOOSE US ================= */}
      <section className="py-16 max-w-6xl mx-auto px-4">

        <h2 className="text-3xl font-bold text-center text-blue-950 mb-10">
          Why Students Trust Us
        </h2>

        <div className="grid md:grid-cols-3 gap-6">

          {[
            ["Safe Travel", "Verified drivers & organized trips"],
            ["Student Focused", "Built specifically for Mzuzu University students"],
            ["Easy Booking", "Book in under 1 minute online"],
          ].map((item, i) => (
            <div key={i} className="bg-white p-6 rounded-xl shadow-md">

              <h3 className="font-bold text-blue-900">{item[0]}</h3>
              <p className="text-gray-600 mt-2 text-sm">{item[1]}</p>

            </div>
          ))}

        </div>
      </section>

      {/* ================= ROUTES ================= */}
      <section id="routes" className="py-16 bg-slate-50">

        <div className="max-w-6xl mx-auto px-4 text-center">

          <h2 className="text-3xl font-bold text-blue-950 mb-10">
            Available Routes
          </h2>

          <div className="grid md:grid-cols-3 gap-6">

            {[
              ["Mzuzu → Lilongwe", "6–7 Hours"],
              ["Mzuzu → Blantyre", "10–12 Hours"],
              ["Mzuzu → Zomba", "9–10 Hours"],
              ["Mzuzu → Kasungu", "4–5 Hours"],
              ["Mzuzu → Karonga", "2–3 Hours"],
            ].map((r, i) => (
              <div key={i} className="bg-white p-6 rounded-xl shadow-lg">

                <h3 className="font-bold text-blue-900">{r[0]}</h3>
                <p className="text-gray-600 text-sm">{r[1]}</p>

                <button
                  onClick={() => {
                    setSelectedRoute(r[0]);
                    setBookingType("route");
                    setShowBooking(true);
                  }}
                  className="mt-4 w-full bg-orange-500 text-white py-2 rounded-lg"
                >
                  Book Route
                </button>

              </div>
            ))}

            {/* CUSTOM */}
            <div className="bg-blue-50 p-6 rounded-xl border-2 border-dashed border-blue-300">

              <h3 className="font-bold text-blue-900">Custom Destination</h3>
              <p className="text-sm text-gray-600">
                We travel anywhere in Malawi
              </p>

              <button
                onClick={() => {
                  setSelectedRoute("");
                  setBookingType("custom");
                  setShowBooking(true);
                }}
                className="mt-4 w-full bg-blue-900 text-white py-2 rounded-lg"
              >
                Request Route
              </button>

            </div>

          </div>

        </div>
      </section>

      {/* ================= HOW IT WORKS ================= */}
      <section id="how" className="py-16 bg-white">

        <div className="max-w-6xl mx-auto px-4 text-center">

          <h2 className="text-3xl font-bold text-blue-950 mb-10">
            How It Works
          </h2>

          <div className="grid md:grid-cols-4 gap-6 text-sm">

            {[
              "Choose Route",
              "Book Online",
              "Receive Confirmation",
              "Travel Safely"
            ].map((step, i) => (
              <div key={i} className="p-6 bg-slate-50 rounded-xl shadow">

                <div className="text-blue-900 font-bold text-xl mb-2">
                  {i + 1}
                </div>

                <p>{step}</p>

              </div>
            ))}

          </div>

        </div>
      </section>

      {/* ================= BOOKING MODAL ================= */}
      {showBooking && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-9999">

          <div className="bg-white p-6 rounded-2xl w-full max-w-md shadow-2xl">

            <button
              type="button"
              onClick={() => {
                setShowBooking(false);
                setForm((prev) => ({ ...prev, name: "", studentId: "", phone: "", seats: 1 }));
                setSelectedRoute("");
                setCustomDestination("");
                setBookingType("custom");
                setError("");
              }}
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-800 text-2xl leading-none hover:bg-gray-100 w-8 h-8 flex items-center justify-center rounded-full"
              aria-label="Close booking modal"
            >
              ✕
            </button>

            <h2 className="text-2xl font-bold mb-1 text-blue-950">Book Trip</h2>
            
            <p className="text-sm text-gray-600 mb-4">
              Destination: <span className="font-semibold text-blue-900">{bookingType === "custom" ? customDestination || "Enter destination" : selectedRoute}</span>
            </p>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg mb-3 text-sm">
                {error}
              </div>
            )}

            <input
              placeholder="Full Name"
              value={form.name}
              className="w-full border border-gray-300 p-3 mb-3 text-black rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              onChange={(e) => {
                setForm({ ...form, name: e.target.value });
                setError("");
              }}
            />

            <input
              placeholder="Student ID"
              value={form.studentId}
              className="w-full border border-gray-300 p-3 mb-3 text-black rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              onChange={(e) => {
                setForm({ ...form, studentId: e.target.value });
                setError("");
              }}
            />

            <input
              placeholder="Phone Number"
              type="tel"
              value={form.phone}
              className="w-full border border-gray-300 p-3 mb-3 text-black rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              onChange={(e) => {
                setForm({ ...form, phone: e.target.value });
                setError("");
              }}
            />

              <div className="mb-3">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Travel Date</label>
                <input
                  type="date"
                  value={form.travelDate}
                  min={new Date().toISOString().split("T")[0]}
                  onChange={(e) => setForm({ ...form, travelDate: e.target.value })}
                  className="w-full border border-gray-300 p-3 mb-3 text-black rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

            <div className="mb-3">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Number of Seats</label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setForm({ ...form, seats: Math.max(1, form.seats - 1) })}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold w-10 h-10 rounded-lg"
                >
                  −
                </button>
                <span className="text-lg font-semibold text-blue-900 w-8 text-center">{form.seats}</span>
                <button
                  onClick={() => setForm({ ...form, seats: Math.min(10, form.seats + 1) })}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold w-10 h-10 rounded-lg"
                >
                  +
                </button>
              </div>
            </div>

            {bookingType === "custom" && (
              <input
                placeholder="Destination (e.g. Mzuzu → Rumphi)"
                value={customDestination}
                className="w-full border border-gray-300 p-3 mb-3 text-black rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                onChange={(e) => {
                  setCustomDestination(e.target.value);
                  setError("");
                }}
              />
            )}

            <button
              onClick={handleBooking}
              disabled={loading || !isFormValid()}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white py-3 rounded-lg font-semibold transition"
            >
              {loading ? "Processing..." : "Confirm Booking"}
            </button>

            <button
              type="button"
              onClick={() => {
                setShowBooking(false);
                setForm((prev) => ({ ...prev, name: "", studentId: "", phone: "", seats: 1 }));
                setSelectedRoute("");
                setCustomDestination("");
                setBookingType("custom");
                setError("");
              }}
              className="w-full mt-3 border border-gray-300 text-gray-800 py-3 rounded-lg font-semibold hover:bg-gray-50 transition"
            >
              Cancel
            </button>

          </div>

        </div>
      )}

      {/* TRACK MODAL */}
      {showTrack && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-9999">
          <div className="bg-white p-6 rounded-2xl w-full max-w-md shadow-2xl relative">
            <button
              type="button"
              onClick={() => {
                setShowTrack(false);
                setTrackId("");
                setTrackError("");
                setTrackResult(null);
              }}
              className="absolute top-3 right-3 text-gray-500 hover:text-gray-800 text-2xl leading-none"
              aria-label="Close track modal"
            >
              ✕
            </button>

            <h2 className="text-2xl font-bold mb-2 text-blue-950">Track Booking</h2>
            <p className="text-sm text-gray-600 mb-4">Enter your Booking ID to check status</p>

            {trackError && <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg mb-3 text-sm">{trackError}</div>}

            <input
              placeholder="Enter Booking ID (e.g. TWH-...)"
              value={trackId}
              onChange={(e) => setTrackId(e.target.value)}
              className="w-full border border-gray-300 p-3 mb-3 text-black rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            <button
              onClick={async () => {
                setTrackError("");
                setTrackResult(null);
                if (!trackId.trim()) {
                  setTrackError("Please enter a Booking ID");
                  return;
                }
                setTrackLoading(true);
                try {
                  const res = await fetch(API_URL, {
                    method: "POST",
                    body: JSON.stringify({ action: "trackBooking", bookingId: trackId.trim() }),
                  });
                  const json = await res.json();
                  if (json && json.success && Array.isArray(json.bookings) && json.bookings.length > 0) {
                    setTrackResult(json.bookings[0]);
                  } else {
                    const backendError = json?.error ? String(json.error) : "Booking not found. Please check your ID.";
                    const backendDebug = json?.debug ? ` Debug: ${JSON.stringify(json.debug)}` : "";
                    setTrackError(`${backendError}${backendDebug}`);
                  }
                } catch (err) {
                  console.error(err);
                  setTrackError("Network error. Please try again.");
                } finally {
                  setTrackLoading(false);
                }
              }}
              disabled={trackLoading}
              className="w-full bg-blue-900 hover:bg-blue-800 disabled:bg-gray-400 text-white py-3 rounded-lg font-semibold transition"
            >
              {trackLoading ? "Searching..." : "Check Status"}
            </button>

            {trackResult && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mt-4">
                <p className="text-xs text-gray-600">Name</p>
                <p className="font-semibold text-blue-900">{String(trackResult.name ?? "—")}</p>

                <p className="text-xs text-gray-600 mt-2">Status</p>
                <p className="font-bold text-lg text-green-600">{String(trackResult.status ?? "—")}</p>

                <p className="text-xs text-gray-600 mt-2">Destination</p>
                <p className="font-semibold text-blue-900">{String(trackResult.destination ?? "—")}</p>

                <p className="text-xs text-gray-600 mt-2">Travel Date</p>
                <p className="font-semibold text-blue-900">{String(trackResult.travelDate ?? "—")}</p>

                <p className="text-xs text-gray-600 mt-2">Seats</p>
                <p className="font-semibold text-blue-900">{String(trackResult.seats ?? 1)}</p>

                <p className="text-xs text-gray-600 mt-2">Trip ID</p>
                <p className="font-semibold text-orange-600">{String(trackResult.tripId ?? "—")}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= SUCCESS MODAL ================= */}
      {successData && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-9999">

          <div className="bg-white p-8 rounded-2xl max-w-md w-full text-center shadow-2xl">

            <div className="text-green-500 text-6xl mb-4 animate-bounce">✔</div>

            <h2 className="text-2xl font-bold text-blue-950 mb-1">
              Booking Successful!
            </h2>

            <p className="text-gray-600 mb-6">Your trip has been confirmed</p>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6 text-left space-y-3">

              <div>
                <p className="text-xs text-gray-600">Name</p>
                <p className="font-semibold text-blue-900">{successData.name}</p>
              </div>

              <div>
                <p className="text-xs text-gray-600">Student ID</p>
                <p className="font-semibold text-blue-900">{successData.studentId}</p>
              </div>

              <div>
                <p className="text-xs text-gray-600">Phone</p>
                <p className="font-semibold text-blue-900">{successData.phone}</p>
              </div>

              <div>
                <p className="text-xs text-gray-600">Destination</p>
                <p className="font-semibold text-blue-900">{successData.route}</p>
              </div>

              <div>
                <p className="text-xs text-gray-600">Seats</p>
                <p className="font-semibold text-blue-900">{successData.seats}</p>
              </div>

              <div className="pt-3 border-t border-blue-200">
                <p className="text-xs text-gray-600 mb-1">Booking ID</p>
                <p className="font-bold text-lg text-green-600">{successData.bookingId}</p>
              </div>

              <div>
                <p className="text-xs text-gray-600 mb-1">Trip ID</p>
                <p className="font-bold text-orange-600">{successData.tripId}</p>
              </div>

            </div>

            <p className="text-sm text-gray-600 mb-6">
              Keep your booking ID for reference. You&apos;ll need it at the pickup point.
            </p>

            <button
              onClick={() => setSuccessData(null)}
              className="w-full bg-blue-900 hover:bg-blue-800 text-white py-3 rounded-lg font-semibold transition"
            >
              Done
            </button>

          </div>

        </div>
      )}

      {/* ================= FOOTER ================= */}
      <footer id="footer" className="bg-blue-950 text-white py-12 mt-10">

        <div className="max-w-6xl mx-auto px-4 text-center">

          <Image src="/logo.png" width={48} height={48} className="mx-auto mb-3 object-contain" alt="Travel with Hawkins Logo" />

          <h3 className="text-lg font-bold">Travel with Hawkins</h3>

          <p className="mt-2">📞 +265989127308 / 0886470843</p>
          <p>📧 hgkalambo@gmail.com</p>

          <a
            href="https://wa.me/265989127308"
            className="inline-block mt-4 bg-green-500 px-5 py-2 rounded-lg"
          >
            WhatsApp Booking
          </a>

          <p className="text-xs text-gray-300 mt-6">
            © 2026 Travel with Hawkins. All rights reserved.
          </p>

        </div>

      </footer>

    </main>
  );
}