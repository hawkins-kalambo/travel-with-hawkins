import {
  normalizeBookingRecord,
  toSupabaseBookingPayload,
  generateBookingId,
  generateTripId,
  type BookingRecord,
} from "@/lib/bookingUtils";

// Re-export server-safe helpers from the original runtime module.
// This isolates route modules from importing the full bookingUtils module directly.
export {
  normalizeBookingRecord,
  toSupabaseBookingPayload,
  generateBookingId,
  generateTripId,
};

export type { BookingRecord };

