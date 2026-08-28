// Pilot booking-policy constants and the deadline rule, shared by the
// conversation flow (for the pre-confirmation preview) and mirrored by
// create_capacity_checked_booking() in SQL (the authority at creation time).
//
// Confirmed rules (master plan §3, decisions D01/D02/D05):
//   R02  one passenger, one seat, one reference per booking
//   R05  booked >= 7 days before departure -> fee due within 7 days
//   R07  departure < 7 days away          -> fee due immediately, 15-min hold
//   D02  departure within 24h             -> not bookable on WhatsApp
//   R08  max 3 active unpaid reservations per WhatsApp contact (no override in pilot)

export const WHATSAPP_POLICY_VERSION = "wa-pilot-1";
export const UNPAID_RESERVATION_LIMIT = 3;
export const FINAL_CUTOFF_HOURS = 24;
export const STANDARD_DEADLINE_DAYS = 7;
export const SHORT_NOTICE_HOLD_MINUTES = 15;

// Malawi keeps a fixed UTC+2 offset year-round (no DST).
export const MALAWI_TZ = "Africa/Blantyre";
export const MALAWI_UTC_OFFSET = "+02:00";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

export type DeadlinePlan =
  | { kind: "too_soon" }
  | { kind: "standard"; deadlineMs: number }
  | { kind: "short_notice"; deadlineMs: number };

/**
 * Given the current time and a departure timestamp (both epoch ms), decide the
 * booking-fee deadline. Pure; no timezone maths beyond the caller having built
 * `departureMs` correctly.
 */
export function planBookingDeadline(nowMs: number, departureMs: number): DeadlinePlan {
  const lead = departureMs - nowMs;
  if (lead < FINAL_CUTOFF_HOURS * HOUR_MS) return { kind: "too_soon" };
  if (lead >= STANDARD_DEADLINE_DAYS * DAY_MS) {
    // Never let the 7-day deadline fall inside the 24h pre-departure cutoff.
    const sevenDays = nowMs + STANDARD_DEADLINE_DAYS * DAY_MS;
    const latest = departureMs - FINAL_CUTOFF_HOURS * HOUR_MS;
    return { kind: "standard", deadlineMs: Math.min(sevenDays, latest) };
  }
  return { kind: "short_notice", deadlineMs: nowMs + SHORT_NOTICE_HOLD_MINUTES * MINUTE_MS };
}

/** Epoch ms for a route_departures row (date + optional time), read in Malawi time. */
export function departureEpochMs(travelDate: string, departureTime?: string | null): number {
  const time = (departureTime && /^\d{2}:\d{2}/.test(departureTime) ? departureTime.slice(0, 8) : "12:00:00");
  const padded = time.length === 5 ? `${time}:00` : time;
  return Date.parse(`${travelDate}T${padded}${MALAWI_UTC_OFFSET}`);
}

/** "10 Sep 2026, 07:00 (Malawi time)" — for customer-facing deadline notices. */
export function formatMalawiDateTime(ms: number): string {
  if (!Number.isFinite(ms)) return "the stated deadline";
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: MALAWI_TZ, day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(new Date(ms));
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return `${get("day")} ${get("month")} ${get("year")}, ${get("hour")}:${get("minute")} (Malawi time)`;
  } catch {
    return new Date(ms).toISOString();
  }
}
