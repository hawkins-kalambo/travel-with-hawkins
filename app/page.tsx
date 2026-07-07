"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { normalizeBookingRecord } from "@/lib/bookingClientUtils";

type BookingStatus = "Booked" | "Confirmed" | "Boarding" | "Departed" | "Arrived" | "Completed" | "Cancelled" | string;
type BookingRecord = {
  destination?: string;
  travelDate?: string;
  seats?: number;
  status?: BookingStatus;
  name?: string;
  bookingId?: string;
  bookingType?: string;
  paymentStatus?: string;
  [key: string]: unknown;
};


const STATUS_ORDER: BookingStatus[] = ["Booked", "Confirmed", "Boarding", "Departed", "Arrived", "Completed"];
const POPULAR_ROUTES = [
  "Mzuzu - Lilongwe",
  "Mzuzu - Blantyre",
  "Mzuzu - Zomba",
  "Mzuzu - Kasunga",
  "Mzuzu - Karonga",
];

const ROUTES_DATA = [
  { route: "Mzuzu - Lilongwe", buses: "Travel With Us today", price: "MWK 70,000", rating: "4.8 (120+)", img: "/images/routes/mzuzu-lilongwe.jpg" },
  { route: "Mzuzu - Blantyre", buses: "Travel With Us today", price: "MWK 120,000", rating: "4.7 (98+)", img: "/images/routes/mzuzu-blantyre.jpg" },
  { route: "Mzuzu - Zomba", buses: "Travel With Us today", price: "MWK 110,000", rating: "4.6 (76+)", img: "/images/routes/mzuzu-zomba.jpeg" },
  { route: "Mzuzu - Kasunga", buses: "Travel With Us Today", price: "MWK 60,000", rating: "4.6 (60+)", img: "/images/routes/mzuzu-kasungu.jpg" },
  { route: "Mzuzu - Karonga", buses: "Travel With Us Today", price: "MWK 45,000", rating: "4.5 (50+)", img: "/images/routes/mzuzu-karonga.jpg" },
];

const HERO_WALLPAPERS = ["/hero.png", "/images/hero/hero1.jpg", "/images/hero/hero3.jpg", "/images/hero/hero6.jpg"];

function StatusBadge({ status }: { status: BookingStatus }) {
  const s = String(status || "Booked");
  const colors: Record<string, string> = {
    Booked: "bg-amber-50 text-amber-700 border-amber-200",
    Confirmed: "bg-blue-50 text-blue-700 border-blue-200",
    Boarding: "bg-sky-50 text-sky-700 border-sky-200",
    Departed: "bg-sky-50 text-sky-700 border-sky-200",
    Arrived: "bg-cyan-50 text-cyan-700 border-cyan-200",
    Completed: "bg-blue-50 text-blue-700 border-blue-200",
    Cancelled: "bg-red-50 text-red-700 border-red-200",
  };
  return <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${colors[s] ?? colors.Booked}`}>{s}</span>;
}

function PaymentBadge({ status }: { status: string }) {
  const paid = status === "Payment Confirmed";
  return <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${paid ? "border-blue-200 bg-blue-50 text-blue-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>{status || "Pending"}</span>;
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
                <div className={`grid h-8 w-8 place-items-center rounded-full border-2 text-xs font-bold ${active ? "border-[#0f3f78] bg-[#0f3f78] text-white" : "border-slate-200 bg-white text-slate-400"}`}>{active ? "OK" : i + 1}</div>
                <span className={`mt-1 max-w-14 text-center text-[10px] leading-tight ${active ? "font-semibold text-[#0f3f78]" : "text-slate-500"}`}>{label}</span>
              </div>
              {i < STATUS_ORDER.length - 1 && <div className={`mx-1 mt-4 h-0.5 flex-1 ${i < activeIndex ? "bg-[#0f3f78]" : "bg-slate-200"}`} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PremiumBoardingPass(props: { name: string; studentId: string; phone: string; destination: string; travelDate: string; seats: number; bookingId: string; bookingType: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(props.bookingId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  const handleDownloadPdf = async () => {
    try {
      const imported = await import("jspdf");
      const Ctor = imported.default || imported.jsPDF;
      const doc = new Ctor({ orientation: "portrait", unit: "pt", format: "a4" });
      const lines = [
        "TRAVEL WITH HAWKINS",
        "Student Transport Boarding Pass",
        `Passenger: ${props.name}`,
        `Student ID: ${props.studentId}`,
        `Phone: ${props.phone}`,
        `Seats: ${props.seats}`,
        `Destination: ${props.destination}`,
        `Travel Date: ${props.travelDate}`,
        `Booking ID: ${props.bookingId}`,
        `Type: ${props.bookingType}`,
      ];
      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.text(lines[0], 40, 48);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      lines.slice(1).forEach((line, i) => doc.text(line, 40, 78 + i * 18));
      doc.save(`TWH-Boarding-Pass-${props.bookingId}.pdf`);
    } catch {
      window.print();
    }
  };

  return (
    <div className="mx-auto max-w-md overflow-hidden rounded-lg border border-blue-100 bg-white shadow-2xl">
      <div className="flex items-center justify-between bg-[#0f3f78] px-5 py-4 text-white">
        <div>
          <h3 className="text-base font-black">Travel with Hawkins</h3>
          <p className="text-[11px] text-white/75">Student Transport Boarding Pass</p>
        </div>
        <span className="rounded-full bg-white/12 px-3 py-1 text-[10px] font-bold uppercase">{props.bookingType}</span>
      </div>
      <div className="space-y-3 px-5 py-4 text-sm">
        <div className="grid grid-cols-2 gap-3">
          {[
            ["Passenger", props.name],
            ["Student ID", props.studentId],
            ["Phone", props.phone],
            ["Seats", props.seats],
            ["Destination", props.destination],
            ["Travel Date", props.travelDate],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
              <p className="font-bold text-slate-900">{String(value)}</p>
            </div>
          ))}
        </div>
        <div className="rounded-md border border-blue-100 bg-blue-50 p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Booking ID</p>
          <p className="font-mono text-sm font-black text-[#0f3f78]">{props.bookingId}</p>
        </div>
      </div>
      <div className="flex divide-x divide-blue-100 border-t border-blue-100">
        <button onClick={handleCopy} className="flex-1 py-3 text-sm font-semibold text-[#0f3f78] hover:bg-blue-50">{copied ? "Copied" : "Copy Booking ID"}</button>
        <button onClick={handleDownloadPdf} className="flex-1 py-3 text-sm font-semibold text-[#0f3f78] hover:bg-blue-50">Download PDF</button>
      </div>
    </div>
  );
}

export default function Home() {
  const [heroIndex, setHeroIndex] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [bookingType, setBookingType] = useState<"route" | "custom">("custom");
  const [selectedRoute, setSelectedRoute] = useState("");
  const [customDestination, setCustomDestination] = useState("");
  const [showBooking, setShowBooking] = useState(false);
  const [showTrack, setShowTrack] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [trackId, setTrackId] = useState("");
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackError, setTrackError] = useState("");
  const [trackResult, setTrackResult] = useState<BookingRecord | null>(null);
  const [allBookings, setAllBookings] = useState<BookingRecord[]>([]);
  const [successData, setSuccessData] = useState<{ name: string; studentId: string; phone: string; route: string; bookingType: "route" | "custom"; travelDate: string; bookingId: string; seats: number } | null>(null);
  const [form, setForm] = useState(() => {
    const base = {
      name: "",
      studentId: "",
      phone: "",
      email: "",
      seats: 1,
      travelDate: new Date().toISOString().split("T")[0],
    };
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem("twh_profile") : null;
      if (raw) {
        const profile = JSON.parse(raw) as Partial<typeof base>;
        return { ...base, name: profile.name || "", studentId: profile.studentId || "", phone: profile.phone || "" };
      }
    } catch {}
    return base;
  });

  useEffect(() => {
    const slider = setInterval(() => {
      setHeroIndex((current) => (current + 1) % HERO_WALLPAPERS.length);
    }, 5500);
    return () => clearInterval(slider);
  }, []);

  useEffect(() => {
    const fetchBookings = async () => {
      try {
        const res = await fetch("/api/bookings");
        const data = await res.json();
        if (Array.isArray(data?.bookings)) setAllBookings(data.bookings);
      } catch {}
    };
    fetchBookings();
    const interval = setInterval(fetchBookings, 30000);
    return () => clearInterval(interval);
  }, []);

  const isFormValid = () => form.name.trim() && form.studentId.trim() && form.phone.trim() && form.seats >= 1 && form.travelDate.trim();
  const today = new Date().toISOString().split("T")[0];
  const urgencyDisplay = allBookings.find((b) => b.travelDate && b.travelDate >= today && b.seats && b.seats >= 11);

  const openBooking = (route = "") => {
    setSelectedRoute(route);
    setBookingType(route ? "route" : "custom");
    setCustomDestination("");
    setError("");
    setShowBooking(true);
  };

  const closeBooking = () => {
    setShowBooking(false);
    setSelectedRoute("");
    setCustomDestination("");
    setBookingType("custom");
    setError("");
  };

  const handleBooking = async () => {
    setError("");
    if (!isFormValid()) return setError("Please fill all required fields.");
    if (bookingType === "custom" && !customDestination.trim()) return setError("Please enter your destination.");
    setLoading(true);
    const destination = bookingType === "custom" ? customDestination.trim() : selectedRoute;
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        body: JSON.stringify({ ...form, destination, pickup: "Mzuzu University", location: "Campus", bookingType }),
      });
      const result = await res.json();
      if (result?.success) {
        const normalized = normalizeBookingRecord(result.booking ?? {});
        setSuccessData({
          name: form.name,
          studentId: form.studentId,
          phone: form.phone,
          route: destination,
          bookingType,
          travelDate: form.travelDate,
          seats: form.seats,
          bookingId: normalized.bookingId || result.bookingId || "PENDING",
        });
        localStorage.setItem("twh_profile", JSON.stringify({ name: form.name.trim(), studentId: form.studentId.trim(), phone: form.phone.trim() }));
        closeBooking();
      } else {
        setError(String(result?.error || "Booking failed. Please try again."));
      }
    } catch {
      setError("Network error. Please check your connection.");
    }
    setLoading(false);
  };

  const trackBooking = async () => {
    setTrackError("");
    setTrackResult(null);
    if (!trackId.trim()) return setTrackError("Please enter a Booking ID.");
    setTrackLoading(true);
    try {
      const res = await fetch(`/api/bookings?trackingId=${encodeURIComponent(trackId.trim())}`);
      const json = await res.json();
      if (json?.success && Array.isArray(json.bookings) && json.bookings.length > 0) setTrackResult(json.bookings[0]);
      else setTrackError(String(json?.error || "Booking not found."));
    } catch {
      setTrackError("Network error. Please try again.");
    }
    setTrackLoading(false);
  };

  return (
    <main className="min-h-screen bg-white text-[#101815]">
      <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-[68px] max-w-7xl items-center justify-between px-4 sm:px-8">
          <a href="#" className="flex items-center gap-2">
            <Image src="/logo.png" width={54} height={54} className="h-12 w-12 object-contain" alt="Travel with Hawkins" />
            <div>
              <div className="text-2xl font-black leading-none text-[#0f3f78]">Travel</div>
              <div className="text-xs font-semibold leading-none">with Hawkins</div>
            </div>
          </a>
          <div className="flex items-center gap-6">
            <nav className="hidden items-center gap-6 text-sm font-bold lg:flex">
              {[
                ["Home", "#"],
                ["Routes", "#routes"],
                ["How It Works", "#how-it-works"],
                ["Help Center", "#help-center"],
                ["Contact", "#contact"],
              ].map(([item, href]) => (
                <a key={item} href={href} className="hover:text-[#0f3f78]">{item}</a>
              ))}
            </nav>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowTrack(true)} className="hidden rounded-md border border-[#0f3f78] px-4 py-2 text-sm font-bold text-[#101815] sm:inline-flex">Track Booking</button>
              <button onClick={() => openBooking()} className="rounded-md bg-[#0f3f78] px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[#0a2d56]">Book Now</button>
              <button onClick={() => setMenuOpen((v) => !v)} className="grid h-10 w-10 place-items-center rounded-md lg:hidden" aria-label="Menu">
                <span className="flex w-5 flex-col gap-1">
                  <span className="h-0.5 rounded bg-[#101815]" />
                  <span className="h-0.5 rounded bg-[#101815]" />
                  <span className="h-0.5 rounded bg-[#101815]" />
                </span>
              </button>
            </div>
          </div>
        </div>
        {menuOpen && (
          <div className="border-t border-slate-100 bg-white px-4 py-3 lg:hidden">
            {[
              ["Home", "#"],
              ["Routes", "#routes"],
              ["How It Works", "#how-it-works"],
              ["Help Center", "#help-center"],
              ["Contact", "#contact"],
            ].map(([item, href]) => (
              <a key={item} href={href} onClick={() => setMenuOpen(false)} className="block rounded-md px-3 py-2 text-sm font-bold hover:bg-blue-50">{item}</a>
            ))}
          </div>
        )}
      </header>

      {urgencyDisplay && <div className="bg-amber-50 px-4 py-2 text-center text-sm font-semibold text-amber-800">Seats are filling fast for {urgencyDisplay.destination}. Book early to secure your spot.</div>}

      <section className="relative min-h-[560px] overflow-visible bg-slate-950 pb-24 text-white md:pb-20">
        {HERO_WALLPAPERS.map((src, index) => (
          <Image
            key={src}
            src={src}
            fill
            priority={index === 0}
            className={`object-cover transition-opacity duration-1000 ease-in-out ${index === heroIndex ? "opacity-100" : "opacity-0"}`}
            alt="Students boarding a Travel with Hawkins bus"
          />
        ))}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,20,41,0.84),rgba(15,63,120,0.52),rgba(7,20,41,0.14))]" />
        <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-[88px] sm:px-8">
          <div className="max-w-2xl">
            <p className="mb-5 inline-flex rounded-md bg-[#1f78d1] px-3 py-1 text-xs font-black uppercase tracking-wide">Safe. Reliable. Student Friendly</p>
            <h1 className="max-w-3xl text-5xl font-black leading-[1.05] tracking-normal md:text-6xl">Book Your Journey Home, The <span className="text-[#6db7ff]">Smart</span> Way</h1>
            <p className="mt-5 max-w-lg text-lg font-medium text-white/90">Connecting university students with trusted bus operators across Malawi.</p>
            <div className="mt-7 flex flex-wrap gap-4">
              <button onClick={() => openBooking()} className="rounded-md bg-[#0f3f78] px-10 py-4 text-sm font-black text-white hover:bg-[#0a2d56]">Book Now</button>
              <a href="#routes" className="rounded-md border border-white px-10 py-4 text-sm font-black text-white hover:bg-white/10">Explore Routes</a>
            </div>
            <div className="mt-6 flex items-center gap-3">
              <div className="flex -space-x-2">
                {["ceo.jpg", "designer.jpg", "developer.jpg"].map((img) => (
                  <Image key={img} src={`/images/team/${img}`} width={36} height={36} className="h-9 w-9 rounded-full border-2 border-white object-cover" alt="" />
                ))}
              </div>
              <div className="text-sm"><span className="text-amber-400">*****</span><br />Trusted by 5,000+ Students</div>
            </div>
          </div>
        </div>

        <div className="absolute inset-x-4 -bottom-16 mx-auto max-w-6xl rounded-lg bg-white p-4 text-[#101815] shadow-2xl md:-bottom-14">
          <div className="mb-4 flex gap-6 border-b border-slate-100 px-1 pb-3 text-sm font-bold">
            <button className="text-[#0f3f78]">One Way</button>
            <button className="text-slate-500">Round Trip</button>
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_0.85fr_0.85fr_auto]">
            <select className="template-input" value={selectedRoute.split(" - ")[0] || ""} onChange={(e) => setSelectedRoute(e.target.value ? `${e.target.value} - Mzuzu` : "")}>
              <option value="">Select departure</option>
              <option>Mzuzu</option>
              <option>Lilongwe</option>
              <option>Blantyre</option>
              <option>Zomba</option>
            </select>
            <select className="template-input" value={selectedRoute} onChange={(e) => setSelectedRoute(e.target.value)}>
              <option value="">Select destination</option>
              {POPULAR_ROUTES.map((r) => <option key={r}>{r}</option>)}
            </select>
            <input className="template-input" type="date" value={form.travelDate} min={today} onChange={(e) => setForm({ ...form, travelDate: e.target.value })} />
            <select className="template-input" value={form.seats} onChange={(e) => setForm({ ...form, seats: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} Passenger{n > 1 ? "s" : ""}</option>)}
            </select>
            <button onClick={() => openBooking(selectedRoute)} className="rounded-md bg-[#0f3f78] px-7 py-3 text-sm font-black text-white">Book Now</button>
          </div>
        </div>
      </section>

      <section className="bg-[#f4f8fd] px-4 pb-6 pt-24">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-4 md:grid-cols-4">
          {[
            ["5,000+", "Students Travelled"],
            ["25+", "Trusted Bus Companies"],
            ["120+", "Routes Across Malawi"],
            ["4.9/5", "Average Student Rating"],
          ].map(([n, l]) => (
            <div key={n} className="flex items-center gap-3 border-r border-slate-200 last:border-r-0">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-[#1f78d1] text-white">*</span>
              <div><div className="text-2xl font-black text-[#0a2d56]">{n}</div><div className="text-xs font-medium">{l}</div></div>
            </div>
          ))}
        </div>
      </section>

      <section id="routes" className="px-4 py-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <p className="text-xs font-black uppercase text-[#0f3f78]">Popular Routes</p>
              <h2 className="text-3xl font-black">Top Destinations</h2>
            </div>
            <a href="#routes" className="text-sm font-bold text-[#0f3f78]">View all routes →</a>
          </div>

          <div className="grid gap-5 md:grid-cols-4">
            {ROUTES_DATA.map((route) => (
              <article key={route.route} className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
                <Image src={route.img} width={420} height={170} className="h-32 w-full object-cover" alt={route.route} />
                <div className="space-y-3 p-4">
                  <h3 className="font-black">{route.route}</h3>
                  <div className="flex justify-between text-xs"><span>{route.buses}</span><span>From {route.price}</span></div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-500">* {route.rating}</span>
                    <button
                      onClick={() => (route.route === "Customized Route" ? openBooking() : openBooking(route.route))}
                      className="rounded border border-[#0f3f78] px-4 py-1.5 text-xs font-black text-[#0f3f78]"
                    >
                      {route.route === "Customized Route" ? "Plan Route" : "Book Now"}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="about-us" className="bg-[#f8fbff] px-4 py-8">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1fr_1.5fr]">
          <div>
            <p className="text-xs font-black uppercase text-[#0f3f78]">Why Choose Us</p>
            <h2 className="text-2xl font-black">Built for Students, Designed for Comfort</h2>
            <ul className="mt-4 space-y-2 text-sm">
              {["Trusted bus operators", "Safe and comfortable journeys", "Easy booking in minutes", "24/7 customer support", "Affordable prices for students"].map((item) => (
                <li key={item} className="flex items-start gap-2 font-medium">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#0f3f78] text-[10px] font-black text-white">✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div id="how-it-works">
            <p className="text-xs font-black uppercase text-[#0f3f78]">How It Works</p>
            <h2 className="text-2xl font-black">Simple Steps to Your Journey</h2>
            <div className="mt-6 grid gap-5 md:grid-cols-4">
              {[
                ["1", "Search Route", "Enter your departure and destination."],
                ["2", "Choose a Bus", "Compare bus operators and prices."],
                ["3", "Select & Pay", "Choose your seat and confirm."],
                ["4", "Travel & Enjoy", "Receive your ticket and go."],
              ].map(([n, t, d]) => (
                <div key={n} className="relative">
                  <div className="mb-3 grid h-8 w-8 place-items-center rounded-full bg-[#0f3f78] text-sm font-black text-white">{n}</div>
                  <h3 className="font-black">{t}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">{d}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="bus-partners" className="px-4 py-8">
        <div className="mx-auto max-w-6xl text-center">
          <p className="text-xs font-black uppercase text-[#0f3f78]">Meet Our Team</p>
          <h2 className="mt-1 text-2xl font-black">The People Behind Travel with Hawkins</h2>
          <div className="mx-auto mt-6 grid max-w-4xl gap-6 md:grid-cols-3">
            {[
              ["Financial Account", "Joshua Kalambo", "/images/team/designer.jpg"],
              ["CEO", "Mwira MCDonald Mukumbwa.", "/images/team/ceo.jpg"],
              ["Logistics Manager", "Hawkins Kalambo", "/images/team/developer.jpg"],
            ].map(([role, name, img]) => (
              <div key={role} className="overflow-hidden rounded-lg border border-slate-200 bg-white text-center shadow-md transition-shadow hover:shadow-xl">
                <Image src={img} width={360} height={210} className="h-40 w-full object-cover object-top" alt={name} />
                <div className="p-4 text-sm">
                  <div className="font-black text-[#0f3f78]">{role}</div>
                  <div className="mt-1">{name}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-8">
        <div className="relative mx-auto max-h-[420px] max-w-6xl overflow-hidden rounded-lg shadow-2xl">
          <Image src="/images/playstore.png" width={1600} height={720} className="h-full w-full object-cover" alt="The Travel with Hawkins App - coming soon" />
        </div>
      </section>

      <section id="help-center" className="px-4 pb-12">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-black uppercase text-[#0f3f78]">Frequently Asked Questions</p>
          <h2 className="text-2xl font-black">Got Questions? We have Got Answers</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {["How do I book a bus ticket?", "Can I cancel or reschedule my booking?", "How will I receive my ticket?", "What payment methods do you accept?", "Is my payment secure?", "Who can I contact for support?"].map((q) => (
              <details key={q} className="rounded-md border border-slate-200 bg-white px-5 py-3">
                <summary className="cursor-pointer font-bold">{q}</summary>
                <p className="mt-2 text-sm text-slate-600">Contact Travel with Hawkins support or use the booking form for help with this question.</p>
              </details>
            ))}
          </div>
          <p className="mt-6 text-sm font-semibold text-slate-600">
            Still need help? <a href="#contact" className="font-black text-[#0f3f78] hover:underline">Contact us</a>
          </p>
        </div>
      </section>

      <footer id="contact" className="bg-[#0a2d56] px-4 py-7 text-white sm:py-8">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-5 md:grid-cols-5">
            <div className="md:col-span-2">
              <div className="mb-4 flex items-center gap-3">
                <Image src="/logo.png" width={56} height={56} alt="" />
                <div>
                  <div className="text-2xl font-black">Travel</div>
                  <div className="text-sm">with Hawkins</div>
                </div>
              </div>
              <p className="max-w-xs text-sm text-white/75">Connecting students with trusted bus operators across Malawi.</p>
            </div>

            <div>
              <h3 className="mb-3 font-black uppercase">Quick Links</h3>
              <ul className="space-y-2 text-sm text-white/75">
                <li><a href="#" className="transition-colors hover:text-white hover:underline">Home</a></li>
                <li><a href="#routes" className="transition-colors hover:text-white hover:underline">Routes</a></li>
                <li><a href="#how-it-works" className="transition-colors hover:text-white hover:underline">How It Works</a></li>
                <li><a href="#contact" className="transition-colors hover:text-white hover:underline">Contact Us</a></li>
              </ul>
            </div>

            <div>
              <h3 className="mb-3 font-black uppercase">Help & Support</h3>
              <ul className="space-y-2 text-sm text-white/75">
                <li><a href="#help-center" className="transition-colors hover:text-white hover:underline">Help Center</a></li>
                <li><a href="#how-it-works" className="transition-colors hover:text-white hover:underline">How It Works</a></li>
                <li><a href="#help-center" className="transition-colors hover:text-white hover:underline">FAQs</a></li>
                <li><a href="#contact" className="transition-colors hover:text-white hover:underline">Contact Us</a></li>
              </ul>
            </div>

            <div>
              <h3 className="mb-3 font-black uppercase">Popular Routes</h3>
              <ul className="space-y-2 text-sm text-white/75">
                <li><a href="#routes" className="transition-colors hover:text-white hover:underline">Mzuzu - Lilongwe</a></li>
                <li><a href="#routes" className="transition-colors hover:text-white hover:underline">Mzuzu - Blantyre</a></li>
                <li><a href="#routes" className="transition-colors hover:text-white hover:underline">Mzuzu - Zomba</a></li>
                <li><a href="#routes" className="transition-colors hover:text-white hover:underline">Mzuzu - Kasunga</a></li>
                <li><a href="#routes" className="transition-colors hover:text-white hover:underline">Mzuzu - Karonga</a></li>
                <li><a href="#routes" className="transition-colors hover:text-white hover:underline">View All Routes</a></li>
              </ul>
            </div>

            <div>
              <h3 className="mb-2 font-black uppercase">Direct Contact</h3>
              <div className="space-y-2.5">
                <a
                  href="https://wa.me/265989127308"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-3 py-2 text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(255,255,255,0.05)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-emerald-500/25 hover:shadow-lg"
                  aria-label="WhatsApp +265989127308"
                >
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-500/90 text-white transition-transform duration-300 group-hover:scale-110">
                    <Image src="/icons/whatsapp.png" width={18} height={18} alt="" />
                  </span>
                  <span>WhatsApp</span>
                </a>

                <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-white/60">Call</p>
                  <a href="tel:+265886470843" className="mt-1 block text-sm font-medium text-white transition-colors hover:text-white hover:underline">0886470843</a>
                </div>

                <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-white/60">Email</p>
                  <a href="mailto:smoothridemw@gmail.com" className="mt-1 block text-sm font-medium text-white transition-colors hover:text-white hover:underline">smoothridemw@gmail.com</a>
                </div>
              </div>
            </div>
          </div>
        </div>

        <p className="mx-auto mt-8 border-t border-white/10 pt-4 text-center text-xs text-white/60">2026 Travel with Hawkins. All Rights Reserved.</p>
      </footer>

      {showBooking && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-lg bg-white p-5 shadow-2xl sm:rounded-lg">
            <div className="mb-4 flex items-start justify-between">
              <div><h2 className="text-2xl font-black">Book Trip</h2><p className="text-sm text-slate-600">Destination: <span className="font-bold text-[#0f3f78]">{bookingType === "custom" ? customDestination || "Enter below" : selectedRoute}</span></p></div>
              <button onClick={closeBooking} className="grid h-8 w-8 place-items-center rounded-md bg-slate-100">x</button>
            </div>
            <div className="mb-4 flex gap-2 overflow-x-auto">
              {POPULAR_ROUTES.map((route) => <button key={route} onClick={() => { setSelectedRoute(route); setBookingType("route"); setCustomDestination(""); }} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold ${selectedRoute === route ? "border-[#0f3f78] bg-[#0f3f78] text-white" : "border-slate-200"}`}>{route}</button>)}
            </div>
            {error && <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
            <div className="space-y-5">
              <div className="space-y-4">
                <input className="template-input" placeholder="Full Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <input className="template-input" placeholder="Student ID" value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })} />
                <input className="template-input" placeholder="Phone Number" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                <input className="template-input" placeholder="Email Address (optional)" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-4 border-t border-slate-100 pt-4">
                {bookingType === "custom" && <input className="template-input" placeholder="Destination (e.g. Mzuzu - Rumphi)" value={customDestination} onChange={(e) => setCustomDestination(e.target.value)} />}
                <input className="template-input" type="date" min={today} value={form.travelDate} onChange={(e) => setForm({ ...form, travelDate: e.target.value })} />
                <select className="template-input" value={form.seats} onChange={(e) => setForm({ ...form, seats: Number(e.target.value) })}>{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n} seat{n > 1 ? "s" : ""}</option>)}</select>
              </div>
              <button onClick={handleBooking} disabled={loading || !isFormValid()} className="w-full rounded-md bg-[#0f3f78] py-3.5 font-black text-white disabled:bg-slate-300">{loading ? "Processing..." : "Confirm Booking"}</button>
            </div>
          </div>
        </div>
      )}

      {showTrack && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between"><div><h2 className="text-2xl font-black">Track Booking</h2><p className="text-sm text-slate-600">Enter your Booking ID to check status.</p></div><button onClick={() => { setShowTrack(false); setTrackResult(null); setTrackError(""); }} className="grid h-8 w-8 place-items-center rounded-md bg-slate-100">x</button></div>
            {trackError && <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{trackError}</div>}
            <input className="template-input" placeholder="Enter Booking ID" value={trackId} onChange={(e) => setTrackId(e.target.value)} />
            <button onClick={trackBooking} disabled={trackLoading} className="mt-3 w-full rounded-md bg-[#0f3f78] py-3.5 font-black text-white disabled:bg-slate-300">{trackLoading ? "Searching..." : "Check Status"}</button>
            {trackResult && (
              <div className="mt-4">
                <StepperTimeline currentStatus={trackResult.status || "Booked"} />
                <div className="mb-3 flex flex-wrap gap-2"><StatusBadge status={trackResult.status || "Booked"} /><PaymentBadge status={String(trackResult.paymentStatus ?? "Pending")} /></div>
                <div className="space-y-2 rounded-md border border-blue-100 bg-blue-50 p-4 text-sm">
                  {["name", "status", "destination", "travelDate", "seats", "bookingType"].map((key) => <div key={key}><p className="text-[10px] uppercase text-slate-500">{key}</p><p className="font-bold">{String(trackResult[key] ?? "-")}</p></div>)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {successData && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-black/60 p-4">
          <div className="py-6">
            <PremiumBoardingPass name={successData.name} studentId={successData.studentId} phone={successData.phone} destination={successData.route} travelDate={successData.travelDate} seats={successData.seats} bookingId={successData.bookingId} bookingType={successData.bookingType} />
            <div className="mt-4 text-center"><button onClick={() => setSuccessData(null)} className="rounded-md bg-[#0f3f78] px-8 py-3 font-black text-white">Done</button></div>
          </div>
        </div>
      )}
    </main>
  );
}
