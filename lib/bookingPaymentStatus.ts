import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Fixes AMB-016 from docs/ambassador-system-audit.md — commission list
// endpoints returned no information about whether the underlying booking
// was ever paid for, so an admin approving a commission had no way to see
// that without opening a second page. Batch-fetches payment status for
// every referenced booking (one extra query, not N+1) and attaches it to
// each referral row as `booking_payment_status`.
export async function attachBookingPaymentStatus(referrals: Array<Record<string, unknown>>): Promise<Array<Record<string, unknown>>> {
  const bookingIds = Array.from(new Set(referrals.map((r) => String(r.booking_id || "")).filter(Boolean)));
  if (bookingIds.length === 0) return referrals;

  const { data: bookings, error: bookingsError } = await supabaseAdmin
    .from("bookings")
    .select("booking_id, status, booking_fee_status, fare_status")
    .in("booking_id", bookingIds);

  if (bookingsError || !bookings) return referrals;

  const byBookingId = new Map(bookings.map((b) => [String(b.booking_id), b]));

  return referrals.map((referral) => {
    const booking = byBookingId.get(String(referral.booking_id || ""));
    return {
      ...referral,
      booking_payment_status: booking
        ? {
            bookingStatus: booking.status ?? null,
            bookingFeeStatus: booking.booking_fee_status ?? null,
            fareStatus: booking.fare_status ?? null,
          }
        : null,
    };
  });
}
