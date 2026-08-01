import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeBookingRecord, type BookingRecord } from "@/lib/bookingUtils";
import { normalizeMalawiPhone } from "@/lib/phoneNumbers";

// A booking ID alone is not a secret — every action that lets a guest (or
// anyone not already authenticated as staff) read or act on a specific
// booking must also confirm they know the email or phone number used to
// create it. This is the single shared implementation of that check, so
// guest booking tracking (Phase 2) and guest payment initialization
// (Phase 3B) can never silently drift apart on what counts as proof.
export function contactMatchesBooking(booking: BookingRecord, contactRaw: string): boolean {
  const contact = contactRaw.trim();
  if (!contact) return false;

  const contactLower = contact.toLowerCase();
  const emailMatches = Boolean(booking.email && booking.email.toLowerCase() === contactLower);

  const normalizedInputPhone = normalizeMalawiPhone(contact);
  const phoneMatches = Boolean(normalizedInputPhone && booking.phone && normalizedInputPhone === booking.phone);

  return emailMatches || phoneMatches;
}

export type BookingLookupResult = { found: true; booking: BookingRecord } | { found: false };

export async function loadBookingById(bookingId: string): Promise<BookingLookupResult> {
  const trimmed = bookingId.trim();
  if (!trimmed) return { found: false };

  const { data, error } = await supabaseAdmin.from("bookings").select("*").eq("booking_id", trimmed).maybeSingle();
  if (error || !data) return { found: false };

  return { found: true, booking: normalizeBookingRecord(data as Record<string, unknown>) };
}
