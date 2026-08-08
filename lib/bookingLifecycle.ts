import { JOURNEY_STATUS_VALUES, normalizeJourneyStatus } from "./statusUtils.ts";
import type { JourneyStatus } from "./bookingTypes.ts";

const ALLOWED_TRANSITIONS: Record<string, readonly JourneyStatus[]> = {
  Booked: ["Confirmed", "Cancelled"],
  Confirmed: ["Boarding", "Cancelled"],
  Boarding: ["Departed", "Cancelled"],
  Departed: ["Arrived"],
  Arrived: ["Completed"],
  Completed: [],
  Cancelled: [],
};

export function parseJourneyStatus(value: unknown): JourneyStatus | null {
  const normalized = normalizeJourneyStatus(value);
  return (JOURNEY_STATUS_VALUES as readonly string[]).includes(normalized) ? normalized : null;
}

export function getAllowedJourneyTransitions(value: unknown): readonly JourneyStatus[] {
  const current = parseJourneyStatus(value) ?? "Booked";
  return ALLOWED_TRANSITIONS[current] ?? [];
}

export function canTransitionJourneyStatus(currentValue: unknown, nextValue: unknown): boolean {
  const current = parseJourneyStatus(currentValue) ?? "Booked";
  const next = parseJourneyStatus(nextValue);
  if (!next) return false;
  if (current === next) return true;
  return getAllowedJourneyTransitions(current).includes(next);
}

export function canRescheduleJourney(value: unknown): boolean {
  const current = parseJourneyStatus(value) ?? "Booked";
  return current === "Booked" || current === "Confirmed";
}

export function parseFutureTravelDate(value: unknown, today = new Date()): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  const todayIso = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
    .toISOString()
    .slice(0, 10);
  return value >= todayIso ? value : null;
}
