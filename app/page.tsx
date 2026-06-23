"use client";

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";

const API_URL = "https://script.google.com/macros/s/AKfycby17HHcmR3G_8GhP7wdb3pvkcZpnAy6R0mtH8W7qrkcRuu5JiEQy4FIRkEDQ81KFk_L/exec";

// ================= TYPES =================
type BookingStatus =
  | "Pending"
  | "Confirmed"
  | "Boarding"
  | "Departed"
  | "Arrived"
  | "Completed"
  | "Cancelled"
  | string;

type BookingRecord = {
  timestamp?: unknown;
  name?: string;
  studentId?: string;
  phone?: string;
  destination?: string;
  travelDate?: string;
  seats?: number;
  pickup?: string;
  location?: string;
  bookingId?: string;
  status?: BookingStatus;
  tripId?: string;
  bookingType?: string;
};

// ================= STATUS ORDER FOR STEPPER =================
const STATUS_ORDER: BookingStatus[] = [
  "Pending",
  "Confirmed",
  "Boarding",
  "Departed",
  "Arrived",
  "Completed",
];

const STEPPER_LABELS = [
  "Passenger Booked",
  "Paid & Confirmed",
  "Boarding",
  "En Route",
  "Arrived",
  "Completed",
];

// ================= COMPONENT: Stepper Timeline =================
function StepperTimeline({ currentStatus }: { currentStatus: BookingStatus }) {
  const currentIndex = STATUS_ORDER.indexOf(currentStatus);
  const activeIndex = currentIndex >= 0 ? currentIndex : 0;

  return (
    <div className="w-full py-4">
      <div className="flex items-center justify-between">
        {STEPPER_LABELS.map((label, i) => {
          const isActive = i <= activeIndex;
          const isCurrent = i === activeIndex;
          return (
            <div key={i} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-300 ${
                    isActive
                      ? "bg-[#006B3F] border-[#006B3F] text-white shadow-md"
                      : "bg-white border-slate-300 text-slate-400"
                  } ${isCurrent ? "ring-2 ring-[#006B3F]/40" : ""}`}
                >
                  {isActive ? "✓" : i + 1}
                </div>
                <span
                  className={`text-[10px] mt-1 text-center leading-tight max-w-[60px] break-words-force ${
                    isActive ? "text-[#006B3F] font-semibold" : "text-slate-400"
                  }`}
                >
                  {label}
                </span>
              </div>
              {i < STEPPER_LABELS.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-1 mt-[-1.5rem] ${
                    i < activeIndex ? "bg-[#006B3F]" : "bg-slate-200"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ================= COMPONENT: Premium Boarding Pass =================
function PremiumBoardingPass({
  name,
  studentId,
  phone,
  destination,
  travelDate,
  seats,
  bookingId,
  tripId,
  bookingType,
}: {
  name: string;
  studentId: string;
  phone: string;
  destination: string;
  travelDate: string;
  seats: number;
  bookingId: string;
  tripId: string;
  bookingType: string;
}) {
  const [copied, setCopied] = useState(false);
  const isPremium = bookingType === "Premium";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(bookingId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const handleDownloadPdf = async () => {
    try {
      // Client-only PDF generation to avoid SSR bundling issues.
      if (typeof window === "undefined") return;

      const bookingRef = String(bookingId || "PENDING").replace(
        /[^a-zA-Z0-9-_]/g,
        ""
      );

      // jsPDF module shape varies by bundler/runtime; resolve the constructor safely.
      // In some bundlers, importing can fail or return unexpected shapes; guard hard.
      let imported: unknown;
      try {
        imported = await import("jspdf");
      } catch (err) {
        // Surface a clearer error and avoid triggering the print fallback.
        throw new Error(
          `Failed to import jsPDF module: ${err instanceof Error ? err.message : String(err)}`
        );
      }

      const importedObj = imported as Record<string, unknown>;
      const maybeDefault =
        importedObj && typeof importedObj === "object"
          ? (importedObj as Record<string, unknown>).default
          : undefined;
      const maybeJsPDF =
        importedObj && typeof importedObj === "object"
          ? (importedObj as Record<string, unknown>).jsPDF
          : undefined;

      // Typical ESM: { default, jsPDF }
      // Typical CJS interop: { default: [ModuleExports], jsPDF: [Constructor] }
      // Use a permissive runtime check for jsPDF to avoid TS lint/typing issues.
      const mod: Record<string, unknown> = imported as Record<string, unknown>;

      const moduleObj = (mod as { module?: unknown }).module as
        | { exports?: { jsPDF?: unknown } }
        | undefined;

      const moduleExportsObj = (mod as { moduleExports?: unknown }).moduleExports as
        | { jsPDF?: unknown }
        | undefined;

      const jsPdfValue = (mod as { jsPDF?: unknown }).jsPDF;

      const Ctor =
        (typeof maybeDefault === "function" && maybeDefault) ||
        (typeof maybeJsPDF === "function" && maybeJsPDF) ||
        (typeof moduleObj?.exports?.jsPDF === "function" && moduleObj.exports.jsPDF) ||
        (typeof moduleExportsObj?.jsPDF === "function" && moduleExportsObj.jsPDF) ||
        (typeof jsPdfValue === "function" && jsPdfValue);


      if (typeof Ctor !== "function") {
        throw new Error(
          `Invalid jsPDF constructor. default=${typeof maybeDefault}, jsPDF=${typeof maybeJsPDF}, ctor=${typeof Ctor}`
        );
      }

      // Strongly type the jsPDF doc instance so methods like addPage() are known.
      type JsPdfDoc = {
        addPage: () => void;
        setFont: (fontName: string, fontStyle?: string) => void;
        setFontSize: (size: number) => void;
        text: (text: string, x: number, y: number) => void;
        save: (filename: string) => void;
      };

      const doc = new (Ctor as unknown as new (opts: Record<string, unknown>) => JsPdfDoc)({
        orientation: "portrait",
        unit: "pt",
        format: "a4",
      });


      const lines = [
        "TRAVEL WITH HAWKINS",
        "Student Transport Boarding Pass",
        "--------------------------------",
        `Passenger: ${name}`,
        `Student ID: ${studentId}`,
        `Phone: ${phone}`,
        `Seats: ${seats}`,
        `Destination: ${destination}`,
        `Travel Date: ${travelDate}`,
        `Booking ID: ${bookingId}`,
        `Trip ID: ${tripId}`,
        `Type: ${bookingType}`,
        "",
        "Departure Safety Rules:",
        "- Arrive at pickup 15 minutes early",
        "- Keep your booking ID for verification",
        "- Luggage limit: 1 bag + 1 hand carry",
        "- Wear seatbelt at all times",
      ];

      const startX = 40;
      let cursorY = 50;
      const lineHeight = 16;

      // Keep cursor within a safe printable area to avoid internal coord bound errors.
      const pageBottom = 820; // pt-ish for A4; keep margin

      const safeCursor = (y: number) => {
        if (!Number.isFinite(y)) return 50;
        return Math.max(30, y);
      };

      const ensureSpace = () => {
        cursorY = safeCursor(cursorY);
        if (cursorY > pageBottom - lineHeight) {
          // TS: doc can be inferred as unknown from the permissive jsPDF constructor typing.
          // Runtime guard ensures build-time type-safety without changing behavior.
          if (typeof (doc as any)?.addPage === "function") {
            (doc as any).addPage();
          }
          cursorY = 50;
        }
      };

      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      ensureSpace();
      doc.text(String(lines[0] ?? ""), startX, cursorY);
      cursorY += lineHeight + 4;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      ensureSpace();
      doc.text(String(lines[1] ?? ""), startX, cursorY);
      cursorY += lineHeight;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);

      for (let i = 2; i < lines.length; i++) {
        const text = lines[i];

        if (!text) {
          cursorY += lineHeight * 0.6;
          continue;
        }

        ensureSpace();
        doc.text(String(text), startX, cursorY);
        cursorY += lineHeight;
      }

      doc.save(`TWH-Boarding-Pass-${bookingRef}.pdf`);
    } catch (e) {
      console.error("PDF generation failed:", e);

      // Avoid crashing UX; only fallback if print exists.
      try {
        if (typeof window !== "undefined" && typeof window.print === "function") {
          window.print();
        }
      } catch {
        // ignore
      }
    }
  };

  return (
    <div
      id="twh_boarding_pass"
      className="bg-white rounded-2xl shadow-2xl border-2 border-blue-100 overflow-hidden max-w-md mx-auto"
    >
      {/* Header Strip */}
      <div className="bg-blue-950 text-white px-5 py-4 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-base">Travel with Hawkins</h3>
          <p className="text-[10px] text-blue-200">Student Transport Boarding Pass</p>
        </div>
        {isPremium && (
          <span className="bg-amber-400 text-amber-900 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wide">
            Premium Luxury
          </span>
        )}
      </div>

      {/* Main Content */}
      <div className="px-5 py-4 space-y-3">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wide">Passenger</p>
            <p className="font-bold text-slate-900 break-words-force">{name}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wide">Student ID</p>
            <p className="font-semibold text-slate-900">{studentId}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wide">Phone</p>
            <p className="font-semibold text-slate-900">{phone}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wide">Seats</p>
            <p className="font-bold text-slate-900">{seats}</p>
          </div>
        </div>

        <div className="border-t border-dashed border-slate-200 pt-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">Destination</p>
              <p className="font-bold text-blue-950 break-words-force">{destination}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">Travel Date</p>
              <p className="font-semibold text-slate-900">{travelDate}</p>
            </div>
          </div>
        </div>

        {/* Barcode-style IDs */}
        <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-slate-500">Booking ID</p>
            <p className="text-sm font-bold text-[#006B3F] font-mono tracking-wider">{bookingId}</p>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-slate-500">Trip ID</p>
            <p className="text-sm font-bold text-orange-600 font-mono tracking-wider">{tripId}</p>
          </div>
        </div>

        {/* Safety rules */}
        <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
          <p className="text-[10px] font-bold text-amber-800 mb-1">🛡 Departure Safety Rules</p>
          <ul className="text-[10px] text-amber-700 space-y-0.5 list-disc list-inside">
            <li>Arrive at pickup 15 minutes early</li>
            <li>Keep your booking ID for verification</li>
            <li>Luggage limit: 1 bag + 1 hand carry</li>
            <li>Wear seatbelt at all times</li>
          </ul>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex border-t border-slate-200 divide-x divide-slate-200">
        <button
          onClick={handleCopy}
          className="flex-1 py-3 text-sm font-semibold text-blue-900 hover:bg-blue-50 transition flex items-center justify-center gap-2"
        >
          {copied ? (
            <>
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-50 border border-blue-100">✓</span>
              Copied
            </>
          ) : (
            <>
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-50 border border-blue-100">⧉</span>
              Copy ID
            </>
          )}
        </button>
        <button
          onClick={() => void handleDownloadPdf()}
          className="flex-1 py-3 text-sm font-semibold text-blue-900 hover:bg-blue-50 transition flex items-center justify-center gap-2"
        >
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-50 border border-blue-100">↓</span>
          Download PDF
        </button>
      </div>
    </div>
  );
}

// ================= MAIN PAGE =================
export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);

  const [selectedRoute, setSelectedRoute] = useState("");
  const [bookingType, setBookingType] = useState<"route" | "custom">("custom");

  const [showBooking, setShowBooking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState(() => {
    try {
      const raw =
        typeof window !== "undefined" ? localStorage.getItem("twh_profile") : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          name: parsed.name || "",
          studentId: parsed.studentId || "",
          phone: parsed.phone || "",
          seats: 1,
          travelDate: new Date().toISOString().split("T")[0],
        };
      }
    } catch {
      // ignore
    }
    return {
      name: "",
      studentId: "",
      phone: "",
      seats: 1,
      travelDate: new Date().toISOString().split("T")[0],
    };
  });

  const POPULAR_ROUTES = [
    "Mzuzu → Lilongwe",
    "Mzuzu → Blantyre",
    "Mzuzu → Zomba",
    "Mzuzu → Kasungu",
    "Mzuzu → Karonga",
  ];

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
    bookingType?: string;
    [key: string]: unknown;
  };

  const [trackResult, setTrackResult] = useState<TrackResult | null>(null);

  // ================= URGENCY ENGINE =================
  const [allBookings, setAllBookings] = useState<BookingRecord[]>([]);
  const [urgencyMessage, setUrgencyMessage] = useState("");

  useEffect(() => {
    // Fetch all bookings to compute urgency
    const fetchUrgency = async () => {
      try {
        const res = await fetch(API_URL);
        const data = await res.json();
        if (data?.bookings && Array.isArray(data.bookings)) {
          setAllBookings(data.bookings as BookingRecord[]);
        }
      } catch {
        // silent
      }
    };
    fetchUrgency();
    const interval = setInterval(fetchUrgency, 30000);
    return () => clearInterval(interval);
  }, []);

  // Compute urgency: find destinations with low remaining seats for upcoming dates
  type UrgencyDisplay = {
    message: string;
    dest: string;
    remaining: number;
  };

  const urgencyDisplay: UrgencyDisplay | null = useMemo(() => {
    if (allBookings.length === 0) return null;
    const today = new Date().toISOString().split("T")[0];

    // Group by destination + travel date for upcoming dates
    const groupMap = new Map<
      string,
      { destination: string; travelDate: string; totalSeats: number; statuses: string[] }
    >();

    for (const b of allBookings) {
      const dest = b.destination || "";
      const date = b.travelDate || "";
      if (date < today) continue; // skip past
      const key = `${dest}||${date}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, { destination: dest, travelDate: date, totalSeats: 0, statuses: [] });
      }
      const g = groupMap.get(key)!;
      g.totalSeats += b.seats || 1;
      g.statuses.push(b.status || "Pending");
    }

    for (const [, g] of groupMap) {
      const seatsUsed = g.totalSeats; // seats booked
      const threshold = 15; // vehicle capacity baseline
      const remaining = threshold - seatsUsed;
      if (remaining > 0 && remaining <= 4) {
        const weekday = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const dayName = weekday[new Date(g.travelDate).getDay()] || g.travelDate;
        return {
          message: `🔥 Only ${remaining} seat${remaining === 1 ? "" : "s"} remaining for ${dayName}'s ${g.destination} dispatch!`,
          dest: g.destination,
          remaining,
        };
      }
    }

    return null;
  }, [allBookings]);

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

        try {
          localStorage.setItem(
            "twh_profile",
            JSON.stringify({
              name: form.name.trim(),
              studentId: form.studentId.trim(),
              phone: form.phone.trim(),
            })
          );
        } catch {
          // ignore
        }

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
              <Image
                src="/logo.png"
                width={48}
                height={48}
                className="object-contain"
                alt="Travel with Hawkins Logo"
              />
              <div>
                <h1 className="text-lg font-bold text-blue-900">Travel with Hawkins</h1>
                <p className="text-[10px] text-gray-500">Safe Journeys • Trusted Service</p>
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

              <div className="md:hidden flex items-center gap-2">
                <button
                  onClick={() => {
                    setSelectedRoute("");
                    setBookingType("custom");
                    setShowBooking(true);
                  }}
                  className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-2 rounded-xl shadow-md text-sm font-semibold transition-transform animate-pop"
                >
                  Book Now
                </button>

                <button
                  onClick={() => setShowTrack(true)}
                  className="bg-blue-900 hover:bg-blue-800 text-white px-3 py-2 rounded-xl shadow-md text-sm font-semibold transition-transform animate-pop"
                >
                  Track Booking
                </button>

                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  aria-label={menuOpen ? "Close menu" : "Open menu"}
                  className="text-2xl p-2 rounded-lg hover:bg-slate-100"
                >
                  ☰
                </button>
              </div>
          </div>
        </div>
      </nav>

      {menuOpen ? (
        <div className="fixed inset-x-0 top-16 z-40 md:hidden bg-white border-t border-slate-200 shadow-xl">
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

      {/* ================= URGENCY INDICATOR ================= */}
      {urgencyDisplay && (
        <div className="pt-20">
          <div className="max-w-6xl mx-auto px-4 mt-2">
            <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-300 rounded-xl px-4 py-3 shadow-sm flex items-center gap-3 animate-pulse">
              <span className="text-xl">🔥</span>
              <p className="text-sm font-semibold text-orange-800 break-words-force">
                {urgencyDisplay.message}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ================= HERO ================= */}
      <section
        className={`pb-12 bg-linear-to-b from-white to-slate-50 ${
          urgencyDisplay ? "pt-4" : "pt-20"
        }`}
      >
        <div className="max-w-6xl mx-auto px-4 flex flex-col-reverse md:flex-row items-center gap-10">
          <div className="flex-1">
            <p className="text-blue-700 font-semibold tracking-wide">🚐 Premium Student Transport System</p>
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
                onClick={() => document.getElementById("routes")?.scrollIntoView()}
                className="border border-blue-900 text-blue-900 px-6 py-3 rounded-xl hover:bg-blue-50"
              >
                Explore Routes
              </button>
            </div>
          </div>

          <div className="flex-1 w-full">
            <Image
              src="/hero.png"
              width={1000}
              height={600}
              className="rounded-2xl shadow-2xl w-full h-auto max-h-[420px] sm:max-h-[480px] md:max-h-[520px] lg:max-h-[560px] object-cover"
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
        <h2 className="text-3xl font-bold text-center text-blue-950 mb-10">Why Students Trust Us</h2>

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
          <h2 className="text-3xl font-bold text-blue-950 mb-10">Available Routes</h2>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              ["Mzuzu → Lilongwe", "6–7 Hours"],
              ["Mzuzu → Blantyre", "10–12 Hours"],
              ["Mzuzu → Zomba", "9–10 Hours"],
              ["Mzuzu → Kasungu", "4–5 Hours"],
              ["Mzuzu → Karonga", "2–3 Hours"],
            ].map((r, i) => (
              <div
                key={i}
                className="bg-white p-6 rounded-xl shadow-lg hover:shadow-2xl hover:-translate-y-1 transform transition cursor-pointer"
              >
                <h3 className="font-bold text-blue-900">{r[0]}</h3>
                <p className="text-gray-600 text-sm">{r[1]}</p>

                <button
                  onClick={() => {
                    setSelectedRoute(r[0]);
                    setBookingType("route");
                    setShowBooking(true);
                  }}
                  className="mt-4 w-full bg-orange-500 text-white py-2 rounded-lg hover:bg-orange-600 transition"
                >
                  Book Route
                </button>
              </div>
            ))}

            <div className="bg-blue-50 p-6 rounded-xl border-2 border-dashed border-blue-300">
              <h3 className="font-bold text-blue-900">Custom Destination</h3>
              <p className="text-sm text-gray-600">We travel anywhere in Malawi</p>

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
          <h2 className="text-3xl font-bold text-blue-950 mb-10">How It Works</h2>

          <div className="grid md:grid-cols-4 gap-6 text-sm">
            {["Choose Route", "Book Online", "Receive Confirmation", "Travel Safely"].map((step, i) => (
              <div key={i} className="p-6 bg-slate-50 rounded-xl shadow">
                <div className="text-blue-900 font-bold text-xl mb-2">{i + 1}</div>
                <p>{step}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= BOOKING MODAL ================= */}
      {showBooking && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center p-4 z-[9999]">
          <div className="bg-white p-4 sm:p-6 rounded-t-2xl w-full max-w-md shadow-2xl sm:rounded-2xl sm:max-w-md sm:mx-auto max-h-[85vh] overflow-y-auto">
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
            <p className="text-sm text-gray-600 mb-2">
              Destination:{" "}
              <span className="font-semibold text-blue-900">
                {bookingType === "custom" ? customDestination || "Enter destination" : selectedRoute}
              </span>
            </p>

            <div className="mb-4">
              <p className="text-xs text-slate-500 mb-2">Popular routes</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {POPULAR_ROUTES.map((r) => {
                  const active = r === selectedRoute && bookingType === "route";
                  return (
                    <button
                      key={r}
                      onClick={() => {
                        setSelectedRoute(r);
                        setBookingType("route");
                        setCustomDestination("");
                      }}
                      className={`shrink-0 px-3 py-2 text-sm rounded-full border ${
                        active
                          ? "bg-blue-900 text-white border-blue-900"
                          : "bg-white text-slate-700 border-slate-200"
                      } hover:shadow-md hover:scale-105 transform transition`}
                    >
                      {r}
                    </button>
                  );
                })}
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg mb-3 text-sm">{error}</div>
            )}

            <input
              placeholder="Full Name"
              value={form.name}
              className="w-full border border-gray-300 p-3 mb-3 bg-white text-slate-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              onChange={(e) => {
                setForm({ ...form, name: e.target.value });
                setError("");
              }}
            />


            <input
              placeholder="Student ID"
              value={form.studentId}
              className="w-full border border-gray-300 p-3 mb-3 bg-white text-slate-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              onChange={(e) => {
                setForm({ ...form, studentId: e.target.value });
                setError("");
              }}
            />

            <input
              placeholder="Phone Number"
              type="tel"
              value={form.phone}
              className="w-full border border-gray-300 p-3 mb-3 bg-white text-slate-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                className="w-full border border-gray-300 p-3 mb-3 bg-white text-slate-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                className="w-full border border-gray-300 p-3 mb-3 bg-white text-slate-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                onChange={(e) => {
                  setCustomDestination(e.target.value);
                  setError("");
                }}
              />
            )}

            <button
              onClick={handleBooking}
              disabled={loading || !isFormValid()}
              className="w-full bg-[#006B3F] hover:bg-green-800 disabled:bg-gray-400 text-white py-3 rounded-lg font-semibold transition"
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
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[9999]">
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

            {/* Track Input - bg-white text-slate-900 */}
            <input
              placeholder="Enter Booking ID (e.g. TWH-...)"
              value={trackId}
              onChange={(e) => setTrackId(e.target.value)}
              className="w-full border border-gray-300 p-3 mb-3 bg-white text-slate-900 placeholder:text-slate-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              className="w-full bg-blue-950 hover:bg-blue-800 disabled:bg-gray-400 text-white py-3 rounded-lg font-semibold transition"
            >
              {trackLoading ? "Searching..." : "Check Status"}
            </button>

            {trackResult && (
              <div className="mt-4">
                {/* Stepper Timeline */}
                <StepperTimeline currentStatus={trackResult.status || "Pending"} />

                {/* Details */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <p className="text-xs text-gray-600">Name</p>
                  <p className="font-semibold text-blue-950">{String(trackResult.name ?? "—")}</p>

                  <p className="text-xs text-gray-600 mt-2">Status</p>
                  <p className="font-bold text-lg text-[#006B3F]">{String(trackResult.status ?? "—")}</p>

                  <p className="text-xs text-gray-600 mt-2">Destination</p>
                  <p className="font-semibold text-blue-950 break-words-force">{String(trackResult.destination ?? "—")}</p>

                  <p className="text-xs text-gray-600 mt-2">Travel Date</p>
                  <p className="font-semibold text-blue-950">{String(trackResult.travelDate ?? "—")}</p>

                  <p className="text-xs text-gray-600 mt-2">Seats</p>
                  <p className="font-semibold text-blue-950">{String(trackResult.seats ?? 1)}</p>

                  <p className="text-xs text-gray-600 mt-2">Trip ID</p>
                  <p className="font-semibold text-orange-600">{String(trackResult.tripId ?? "—")}</p>

                  <p className="text-xs text-gray-600 mt-2">Type</p>
                  <p className="font-semibold text-blue-950">{String(trackResult.bookingType ?? "Standard")}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= SUCCESS / BOARDING PASS MODAL ================= */}
      {successData && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[9999] overflow-y-auto">
          <div className="py-6">
            <PremiumBoardingPass
              name={successData.name}
              studentId={successData.studentId}
              phone={successData.phone}
              destination={successData.route}
              travelDate={successData.date}
              seats={successData.seats}
              bookingId={successData.bookingId}
              tripId={successData.tripId}
              bookingType={String(successData.bookingType || "Standard")}
            />


            <div className="mt-4 flex justify-center gap-3">
              <button
                onClick={() => setSuccessData(null)}
                className="bg-blue-950 hover:bg-blue-800 text-white px-6 py-2.5 rounded-lg font-semibold transition shadow-md"
              >
                Done
              </button>
            </div>
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