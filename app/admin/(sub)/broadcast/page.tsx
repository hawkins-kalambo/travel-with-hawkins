"use client";

import { useEffect, useMemo, useState } from "react";
import { authFetch } from "@/lib/auth";
import type { BookingRecord } from "@/lib/bookingTypes";
import PageHeader from "@/app/components/ui/PageHeader";
import { LoadingState } from "@/app/components/ui/Spinner";

type EnrichedBooking = BookingRecord & { status: string };

function formatDate(date: Date): string {
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${weekdays[date.getDay()]}, ${months[date.getMonth()]} ${String(date.getDate()).padStart(2, "0")}, ${date.getFullYear()}`;
}

export default function AdminBroadcastPage() {
  const [bookings, setBookings] = useState<EnrichedBooking[]>([]);
  const [maxSeats, setMaxSeats] = useState("15");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [bookingsRes, settingsRes] = await Promise.all([
          authFetch("/api/admin/bookings", { method: "GET", cache: "no-store" }),
          authFetch("/api/settings", { method: "GET" }),
        ]);

        if (bookingsRes.ok) {
          const data: unknown = await bookingsRes.json();
          const list = (data as { bookings?: unknown } | null | undefined)?.bookings;
          const source: BookingRecord[] = Array.isArray(list) ? (list as BookingRecord[]) : [];
          setBookings(
            source.map((b) => ({
              ...b,
              status: typeof b.status === "string" && b.status.trim() ? b.status : "Booked",
            }))
          );
        }

        if (settingsRes.ok) {
          const data: unknown = await settingsRes.json();
          const payload = (data as { settings?: Record<string, unknown> } | null | undefined)?.settings;
          if (payload) setMaxSeats(String(payload.max_seats ?? payload.maxSeats ?? "15"));
        }
      } catch (error) {
        console.error("Failed to load broadcast data:", error);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  // Groups ALL fetched bookings by tripId — deliberately not scoped by any
  // search/campus filter (unlike the monolith tab this was extracted from,
  // which silently reused the Trips/Bookings tabs' `filtered` memo, so a
  // stale filter left over from another tab could invisibly narrow what got
  // broadcast). This page always reflects the full active-trips list.
  const tripGroups = useMemo(() => {
    const acc: Record<string, EnrichedBooking[]> = {};
    for (const item of bookings) {
      const tripId = String(item.tripId || "").trim();
      if (!tripId) continue;
      if (!acc[tripId]) acc[tripId] = [];
      acc[tripId].push(item);
    }
    return acc;
  }, [bookings]);

  const generateMessage = () => {
    if (Object.keys(tripGroups).length === 0) {
      setMessage("No active trips to broadcast.");
      return;
    }

    const parts: string[] = [];
    parts.push("🚐 *TRAVEL WITH HAWKINS — ACTIVE TRIPS* 🚐\n");
    parts.push("📅 " + formatDate(new Date()) + "\n");

    for (const [tripId, passengers] of Object.entries(tripGroups)) {
      const dest = passengers[0]?.destination || "—";
      const date = passengers[0]?.travelDate || "—";
      const status = passengers[0]?.status || "Pending";
      const totalSeats = passengers.reduce((s, p) => s + (p.seats || 1), 0);
      const capacity = parseInt(maxSeats) || 15;
      const remaining = capacity - totalSeats;

      parts.push(`\n━━━━━━━━━━━━━━━━━`);
      parts.push(`🚍 *Trip:* ${tripId}`);
      parts.push(`📍 *Destination:* ${dest}`);
      parts.push(`📆 *Date:* ${date}`);
      parts.push(`📊 *Status:* ${status}`);
      parts.push(`👥 *Passengers:* ${passengers.length} | *Seats:* ${totalSeats}/${capacity}`);
      if (remaining > 0) parts.push(`🪑 *Seats Available:* ${remaining}`);
      else parts.push(`❌ *Fully Booked*`);

      const names = passengers.map((p) => `• ${p.name || "—"} (${p.phone || "—"})`).join("\n");
      parts.push(`\n*Passenger List:*\n${names}`);
    }

    parts.push("\n━━━━━━━━━━━━━━━━━");
    parts.push("📞 *Bookings & Inquiries:* +265989127308");
    parts.push("💬 *WhatsApp:* https://wa.me/265989127308\n");
    parts.push("_Safe Journeys • Trusted Service_");

    setMessage(parts.join("\n"));
  };

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert("Copy failed. Please select and copy manually.");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Broadcast"
        title="WhatsApp Broadcast Studio"
        description="Generate a formatted promotional message from active trip manifests, ready to share on student WhatsApp groups."
      />

      {loading ? (
        <LoadingState label="Loading trips…" />
      ) : (
        <div className="space-y-6">
          <div className="bg-white border border-[#d7ebff] rounded-xl shadow-sm p-6">
            <button
              onClick={generateMessage}
              className="bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-lg font-semibold shadow-sm transition"
            >
              📱 Generate Broadcast Message
            </button>
          </div>

          {message && (
            <div className="bg-white border border-[#d7ebff] rounded-xl shadow-sm p-6">
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-sm font-bold text-primary-900">Your Broadcast Message</h4>
                <button
                  onClick={copyMessage}
                  className="rounded-lg bg-primary-900 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-800"
                >
                  {copied ? "✓ Copied!" : "📋 Copy"}
                </button>
              </div>
              <textarea
                readOnly
                value={message}
                rows={20}
                className="w-full resize-y whitespace-pre-wrap break-words-force rounded-xl border border-slate-200 bg-white p-4 font-mono text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent-600"
              />
            </div>
          )}

          {Object.keys(tripGroups).length > 0 && !message && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-sm text-amber-800">
                ⚡ {Object.keys(tripGroups).length} active trip{Object.keys(tripGroups).length === 1 ? "" : "s"} ready for broadcast.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
