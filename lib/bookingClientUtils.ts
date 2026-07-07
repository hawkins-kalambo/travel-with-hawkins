import { normalizeBookingRecord as sharedNormalizeBookingRecord } from "@/lib/bookingUtils";
import type { BookingRecord } from "@/lib/bookingTypes";

export function normalizeBookingRecord(
  record: Record<string, unknown> | null | undefined
): BookingRecord {
  return sharedNormalizeBookingRecord(record);
}

