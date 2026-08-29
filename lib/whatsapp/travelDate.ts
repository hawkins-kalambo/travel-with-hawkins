// Resolve a customer's typed travel date. Accepts an explicit YYYY-MM-DD, a
// day-first numeric date (Malawi convention), a spelled-out date, or a small
// set of relative expressions ("tomorrow", "in 3 days"). Everything is
// resolved against the current calendar day in Malawi (Africa/Blantyre, a
// fixed UTC+2 with no DST). Past dates are rejected; the caller confirms the
// resolved date with the customer and never silently changes it.

export type TravelDateResult =
  | { ok: true; iso: string; label: string }
  | { ok: false; reason: "past" | "too_far" | "unparseable" };

const MAX_DAYS_AHEAD = 365;

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};

function malawiTodayUtcMidnight(now: Date): Date {
  const shifted = new Date(now.getTime() + 2 * 3_600_000); // UTC+2, fixed
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
}

function isRealDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

function labelFor(y: number, m: number, d: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

// Returns [y, m, d] or null. Does not range-check against today.
function parseCalendar(raw: string, today: Date): [number, number, number] | null {
  const text = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!text) return null;

  const thisYear = today.getUTCFullYear();

  // Relative expressions
  const rel = (days: number): [number, number, number] => {
    const dt = new Date(today.getTime() + days * 86_400_000);
    return [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
  };
  if (text === "today") return rel(0);
  if (["tomorrow", "tmrw", "tmw", "2moro", "tomorow"].includes(text)) return rel(1);
  if (["day after tomorrow", "overmorrow", "the day after tomorrow"].includes(text)) return rel(2);
  if (text === "next week") return rel(7);
  const inDays = text.match(/^(?:in )?(\d{1,3})\s*days?(?:\s*(?:from now|from today|time))?$/);
  if (inDays) return rel(Number(inDays[1]));

  // ISO YYYY-MM-DD
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return [Number(iso[1]), Number(iso[2]), Number(iso[3])];

  // Day-first numeric: D/M/Y, D-M-Y, D.M.Y  (Y optional -> this year)
  const dmy = text.match(/^(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{2,4}))?$/);
  if (dmy) {
    const d = Number(dmy[1]);
    const m = Number(dmy[2]);
    let y = dmy[3] ? Number(dmy[3]) : thisYear;
    if (y < 100) y += 2000;
    return [y, m, d];
  }

  // Spelled-out: "20 September [2026]" or "September 20[,] [2026]"
  const dMon = text.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\.?(?:,?\s+(\d{4}))?$/);
  if (dMon && MONTHS[dMon[2]]) {
    return [dMon[3] ? Number(dMon[3]) : thisYear, MONTHS[dMon[2]], Number(dMon[1])];
  }
  const monD = text.match(/^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?$/);
  if (monD && MONTHS[monD[1]]) {
    return [monD[3] ? Number(monD[3]) : thisYear, MONTHS[monD[1]], Number(monD[2])];
  }

  return null;
}

export function resolveTravelDate(input: unknown, now: Date = new Date()): TravelDateResult {
  if (typeof input !== "string") return { ok: false, reason: "unparseable" };
  const today = malawiTodayUtcMidnight(now);

  let parsed = parseCalendar(input, today);
  if (!parsed) return { ok: false, reason: "unparseable" };
  let [y, m, d] = parsed;

  // A spelled-out / numeric date with no year that has already passed this
  // year rolls to next year ("20 September" in October -> next year).
  if (isRealDate(y, m, d) && !/\d{4}/.test(input)) {
    const candidate = Date.UTC(y, m - 1, d);
    if (candidate < today.getTime()) {
      parsed = parseCalendar(input.trim() + " " + (y + 1), today);
      if (parsed) [y, m, d] = parsed;
    }
  }

  if (!isRealDate(y, m, d)) return { ok: false, reason: "unparseable" };

  const target = Date.UTC(y, m - 1, d);
  if (target < today.getTime()) return { ok: false, reason: "past" };
  if (target > today.getTime() + MAX_DAYS_AHEAD * 86_400_000) return { ok: false, reason: "too_far" };

  return {
    ok: true,
    iso: `${y.toString().padStart(4, "0")}-${m.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`,
    label: labelFor(y, m, d),
  };
}
