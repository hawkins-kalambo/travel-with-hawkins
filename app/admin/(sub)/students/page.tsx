"use client";

import { useEffect, useMemo, useState } from "react";
import { authFetch } from "@/lib/auth";
import type { BookingRecord } from "@/lib/bookingTypes";
import type { JourneyStatus } from "@/lib/bookingUtils";
import { calcBookingRevenue } from "@/lib/bookingRevenue";
import { normalizeMalawiPhone } from "@/lib/phoneNumbers";
import PageHeader from "@/app/components/ui/PageHeader";
import { LoadingState } from "@/app/components/ui/Spinner";
import JourneyStatusBadge from "@/app/components/ui/JourneyStatusBadge";
import MoneyStatusBadge, { BOOKING_FEE_STATUS_COLORS, FARE_STATUS_COLORS } from "@/app/components/ui/MoneyStatusBadge";

type EnrichedBooking = BookingRecord & { status: JourneyStatus };

type StudentGroup = {
  key: string;
  studentId: string;
  name: string;
  phone: string;
  bookings: EnrichedBooking[];
  totalSeats: number;
  totalSpent: number;
  unpaidFeeCount: number;
  unpaidFareCount: number;
  firstBookingAt: string | undefined;
  lastBookingAt: string | undefined;
  // True when this group was formed without a real Student ID (matched by
  // phone, or — with neither ID nor phone — isolated to a single booking).
  // Surfaced in the UI so admins know the grouping is a best-effort guess,
  // not a verified identity.
  hasIdentityGap: boolean;
};

const STUDENTS_PAGE_SIZE = 20;

function formatDate(date: Date): string {
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${weekdays[date.getDay()]}, ${months[date.getMonth()]} ${String(date.getDate()).padStart(2, "0")}, ${date.getFullYear()}`;
}

function formatShortDate(value: string | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return formatDate(date);
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0 || parts[0] === "—") return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}

function StatTile({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-black ${accent ? "text-accent-600" : "text-slate-900"}`}>{value}</p>
    </div>
  );
}

export default function AdminStudentsPage() {
  const [bookings, setBookings] = useState<EnrichedBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentSort, setStudentSort] = useState<"bookings" | "spend" | "recent" | "name">("bookings");
  const [studentPage, setStudentPage] = useState(1);
  const [selectedStudentKey, setSelectedStudentKey] = useState<string | null>(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(async () => {
      try {
        const bookingsRes = await authFetch("/api/admin/bookings", { method: "GET", cache: "no-store" });

        if (bookingsRes.ok) {
          const data: unknown = await bookingsRes.json();
          const list = (data as { bookings?: unknown } | null | undefined)?.bookings;
          const source: BookingRecord[] = Array.isArray(list) ? (list as BookingRecord[]) : [];
          setBookings(
            source.map((b) => ({
              ...b,
              status: typeof b.status === "string" && b.status.trim() ? (b.status as JourneyStatus) : "Booked",
            }))
          );
        }
      } catch (error) {
        console.error("Failed to load students data:", error);
      } finally {
        setLoading(false);
      }
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  const studentGroups = useMemo(() => {
    const acc: Record<string, StudentGroup> = {};

    bookings.forEach((b, index) => {
      const rev = calcBookingRevenue(b);
      const rawStudentId = String(b.studentId ?? "").trim();
      const rawPhone = String(b.phone ?? "").trim();

      let key: string;
      let hasIdentityGap = false;
      if (rawStudentId) {
        key = `sid:${rawStudentId.toLowerCase()}`;
      } else if (rawPhone) {
        key = `phone:${rawPhone}`;
        hasIdentityGap = true;
      } else {
        key = `booking:${b.bookingId ?? `idx-${index}`}`;
        hasIdentityGap = true;
      }

      if (!acc[key]) {
        acc[key] = {
          key,
          studentId: rawStudentId || "—",
          name: b.name || "—",
          phone: b.phone || "—",
          bookings: [],
          totalSeats: 0,
          totalSpent: 0,
          unpaidFeeCount: 0,
          unpaidFareCount: 0,
          firstBookingAt: undefined,
          lastBookingAt: undefined,
          hasIdentityGap,
        };
      }

      const group = acc[key];
      group.bookings.push(b);
      group.totalSeats += b.seats || 1;
      group.totalSpent += rev.total;
      if (b.bookingFeeStatus !== "paid") group.unpaidFeeCount += 1;
      if (b.fareStatus !== "paid" && b.fareStatus !== "cash_collected") group.unpaidFareCount += 1;
      if (!group.name || group.name === "—") group.name = b.name || "—";
      if (!group.phone || group.phone === "—") group.phone = b.phone || "—";

      if (b.createdAt) {
        if (!group.firstBookingAt || b.createdAt < group.firstBookingAt) group.firstBookingAt = b.createdAt;
        if (!group.lastBookingAt || b.createdAt > group.lastBookingAt) group.lastBookingAt = b.createdAt;
      }
    });

    return Object.values(acc);
  }, [bookings]);

  const studentStats = useMemo(() => {
    const totalStudents = studentGroups.length;
    const repeatCustomers = studentGroups.filter((s) => s.bookings.length > 1).length;
    const totalRevenue = studentGroups.reduce((sum, s) => sum + s.totalSpent, 0);
    const totalBookingsCount = studentGroups.reduce((sum, s) => sum + s.bookings.length, 0);
    const avgBookings = totalStudents > 0 ? totalBookingsCount / totalStudents : 0;
    return { totalStudents, repeatCustomers, totalRevenue, avgBookings };
  }, [studentGroups]);

  const filteredStudentGroups = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    const list = q
      ? studentGroups.filter(
          (s) => s.name.toLowerCase().includes(q) || s.studentId.toLowerCase().includes(q) || s.phone.toLowerCase().includes(q)
        )
      : studentGroups;

    const sorted = [...list];
    if (studentSort === "spend") sorted.sort((a, b) => b.totalSpent - a.totalSpent);
    else if (studentSort === "recent") sorted.sort((a, b) => (b.lastBookingAt || "").localeCompare(a.lastBookingAt || ""));
    else if (studentSort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else sorted.sort((a, b) => b.bookings.length - a.bookings.length);
    return sorted;
  }, [studentGroups, studentSearch, studentSort]);

  const totalStudentPages = Math.max(1, Math.ceil(filteredStudentGroups.length / STUDENTS_PAGE_SIZE));
  const safeStudentPage = Math.min(studentPage, totalStudentPages);
  const pagedStudentGroups = useMemo(() => {
    const start = (safeStudentPage - 1) * STUDENTS_PAGE_SIZE;
    return filteredStudentGroups.slice(start, start + STUDENTS_PAGE_SIZE);
  }, [filteredStudentGroups, safeStudentPage]);

  const selectedStudent = useMemo(
    () => studentGroups.find((s) => s.key === selectedStudentKey) ?? null,
    [studentGroups, selectedStudentKey]
  );

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Students" title="Students CRM" description="Every customer grouped by identity, with spend and booking history." />

      {loading ? (
        <LoadingState label="Loading students…" />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Total Students" value={studentStats.totalStudents} />
            <StatTile label="Repeat Customers" value={studentStats.repeatCustomers} />
            <StatTile label="Total Revenue" value={`MWK ${studentStats.totalRevenue.toLocaleString()}`} accent />
            <StatTile label="Avg Bookings / Student" value={studentStats.avgBookings.toFixed(1)} />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:w-72">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">🔎</span>
              <input
                value={studentSearch}
                onChange={(e) => {
                  setStudentSearch(e.target.value);
                  setStudentPage(1);
                }}
                placeholder="Search by name, student ID, or phone..."
                className="w-full pl-9 pr-8 py-2 border border-[#d7ebff] rounded-xl text-sm bg-[#eef6ff] text-[#101815] placeholder:text-[#64748b] focus:outline-none focus:ring-4 focus:ring-[#0f3f78]/20 focus:border-[#0f3f78]"
              />
              {studentSearch && (
                <button
                  onClick={() => {
                    setStudentSearch("");
                    setStudentPage(1);
                  }}
                  className="absolute inset-y-0 right-2 flex items-center text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              )}
            </div>
            <select
              value={studentSort}
              onChange={(e) => setStudentSort(e.target.value as typeof studentSort)}
              className="rounded-xl border border-[#d7ebff] bg-[#eef6ff] px-3 py-2 text-sm text-[#101815] focus:outline-none focus:ring-4 focus:ring-[#0f3f78]/20 focus:border-[#0f3f78]"
            >
              <option value="bookings">Sort: Most bookings</option>
              <option value="spend">Sort: Highest spend</option>
              <option value="recent">Sort: Most recent</option>
              <option value="name">Sort: Name A–Z</option>
            </select>
          </div>

          {filteredStudentGroups.length === 0 ? (
            <div className="bg-white border border-[#d7ebff] rounded-xl shadow-sm p-8 text-center">
              <p className="text-slate-700 font-semibold text-lg">{studentSearch ? "No students match your search" : "No students found"}</p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {pagedStudentGroups.map((student) => (
                  <button
                    key={student.key}
                    type="button"
                    onClick={() => setSelectedStudentKey(student.key)}
                    className="w-full text-left bg-white rounded-xl shadow-sm border border-[#d7ebff] p-4 sm:p-5 hover:shadow-md hover:border-[#0f3f78]/40 transition"
                  >
                    <div className="flex items-center gap-4">
                      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#0f3f78] text-sm font-black text-white">
                        {getInitials(student.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-bold text-primary-900 break-words-force">{student.name}</h3>
                          {student.bookings.length > 1 ? (
                            <span className="inline-flex rounded-full border border-primary-200 bg-primary-100 px-2 py-0.5 text-[10px] font-semibold text-primary-700">
                              Repeat
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                              First-time
                            </span>
                          )}
                          {student.unpaidFeeCount > 0 && (
                            <span className="inline-flex rounded-full border border-[color:var(--warning)]/20 bg-[color:var(--warning)]/10 px-2 py-0.5 text-[10px] font-semibold text-[color:var(--warning)]">
                              {student.unpaidFeeCount} unpaid fee{student.unpaidFeeCount === 1 ? "" : "s"}
                            </span>
                          )}
                          {student.hasIdentityGap && (
                            <span
                              title="No Student ID on file — grouped by phone number or a single booking"
                              className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500"
                            >
                              No ID on file
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">ID: {student.studentId}</p>
                        <p className="text-xs text-slate-400">📱 {student.phone}</p>
                      </div>
                      <div className="flex gap-4 text-sm shrink-0">
                        <div className="text-center">
                          <p className="font-bold text-primary-900">{student.bookings.length}</p>
                          <p className="text-[10px] text-slate-500">Bookings</p>
                        </div>
                        <div className="text-center">
                          <p className="font-bold text-primary-900">{student.totalSeats}</p>
                          <p className="text-[10px] text-slate-500">Seats</p>
                        </div>
                        <div className="text-center">
                          <p className="font-bold text-accent-600">MWK {student.totalSpent.toLocaleString()}</p>
                          <p className="text-[10px] text-slate-500">Spent</p>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {totalStudentPages > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-slate-500">
                    Page {safeStudentPage} of {totalStudentPages} • {filteredStudentGroups.length} student{filteredStudentGroups.length === 1 ? "" : "s"}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setStudentPage((p) => Math.max(1, p - 1))}
                      disabled={safeStudentPage === 1}
                      className="rounded-xl border border-[#d7ebff] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      onClick={() => setStudentPage((p) => Math.min(totalStudentPages, p + 1))}
                      disabled={safeStudentPage === totalStudentPages}
                      className="rounded-xl border border-[#d7ebff] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {selectedStudent && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4" onClick={() => setSelectedStudentKey(null)}>
              <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[#d7ebff] bg-white p-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#0f3f78] text-base font-black text-white">
                      {getInitials(selectedStudent.name)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-lg font-bold text-primary-900 break-words-force">{selectedStudent.name}</h3>
                      <p className="text-xs text-slate-500">
                        ID: {selectedStudent.studentId} • 📱 {selectedStudent.phone}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedStudentKey(null)}
                    aria-label="Close"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-5 p-5">
                  {selectedStudent.hasIdentityGap && (
                    <div className="rounded-xl border border-[color:var(--warning)]/20 bg-[color:var(--warning)]/10 p-3 text-xs text-[color:var(--warning)]">
                      No Student ID is on file for this group — matched by {selectedStudent.phone !== "—" ? "phone number" : "a single booking"} instead.
                      The same student may appear as more than one card if their contact details vary across bookings.
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <StatTile label="Bookings" value={selectedStudent.bookings.length} />
                    <StatTile label="Total Seats" value={selectedStudent.totalSeats} />
                    <StatTile label="Total Spent" value={`MWK ${selectedStudent.totalSpent.toLocaleString()}`} accent />
                    <StatTile label="Last Booked" value={formatShortDate(selectedStudent.lastBookingAt)} />
                  </div>

                  {selectedStudent.phone !== "—" && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(selectedStudent.phone);
                        }}
                        className="rounded-xl border border-[#d7ebff] bg-[#eef6ff] px-3 py-2 text-xs font-semibold text-[#0f3f78] hover:bg-[#dbeafe]"
                      >
                        📋 Copy Phone
                      </button>
                      {normalizeMalawiPhone(selectedStudent.phone) && (
                        <a
                          href={`https://wa.me/${normalizeMalawiPhone(selectedStudent.phone)!.replace("+", "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-xl bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700"
                        >
                          💬 Chat on WhatsApp
                        </a>
                      )}
                    </div>
                  )}

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Full Booking History ({selectedStudent.bookings.length})
                    </p>
                    <div className="max-h-96 space-y-0 overflow-y-auto rounded-xl border border-[#d7ebff]">
                      {selectedStudent.bookings
                        .slice()
                        .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
                        .map((b, i) => (
                          <div key={b.bookingId || i} className="flex flex-wrap items-center justify-between gap-2 border-b border-[#d7ebff] p-3 text-xs last:border-0">
                            <div className="min-w-0">
                              <p className="font-medium text-slate-700 break-words-force">{b.destination || "—"}</p>
                              <p className="text-slate-400">
                                {b.travelDate || "—"} • {b.seats || 1} seat{b.seats !== 1 ? "s" : ""} • {b.bookingId || "—"}
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              <JourneyStatusBadge status={b.status} />
                              <MoneyStatusBadge status={b.bookingFeeStatus || "unpaid"} colors={BOOKING_FEE_STATUS_COLORS} />
                              <MoneyStatusBadge status={b.fareStatus || "unpaid"} colors={FARE_STATUS_COLORS} />
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
