import type { BookingFeeStatus, FareStatus, PaymentMethod } from "@/lib/paymentTypes";
import type { JourneyDirection } from "@/lib/journeyDirection";

export type JourneyStatus =
  | "Booked"
  | "Confirmed"
  | "Boarding"
  | "Departed"
  | "Arrived"
  | "Completed"
  | "Cancelled"
  | string;

// Legacy single payment field. New code should prefer bookingFeeStatus /
// fareStatus, which are tracked independently — see lib/paymentTypes.ts.
export type PaymentStatus =
  | "Pending"
  | "Payment Confirmed"
  | "Failed"
  | string;

export type BookingRecord = {
  bookingId?: string;
  tripId?: string;
  name?: string;
  phone?: string;
  email?: string;
  studentId?: string;
  destination?: string;
  travelDate?: string;
  seats?: number;
  pickup?: string;
  location?: string;
  bookingType?: string;
  fare?: number;
  routeId?: string;
  universityId?: string;
  districtPickupPointId?: string;
  universityPickupPointId?: string;
  journeyDirection?: JourneyDirection;
  homeDistrict?: string;
  journeyOrigin?: string;
  journeyDestination?: string;
  referralCode?: string;
  ambassadorId?: string;
  referralSource?: string;
  commissionAmount?: number;
  referralStatus?: string;

  // Journey status only
  status?: JourneyStatus;

  // Payment status is independent from journey status
  paymentStatus?: PaymentStatus;
  paymentConfirmedAt?: string;
  receiptNumber?: string;
  receiptSent?: boolean;
  paymentNotes?: string;

  // Booking fee (compulsory, confirms the seat) — independent of fare.
  bookingFeeAmount?: number;
  bookingFeeStatus?: BookingFeeStatus;
  bookingFeePaidAt?: string;
  bookingExpiresAt?: string;

  // Transport fare (optional online payment, or cash) — independent of the booking fee.
  fareStatus?: FareStatus;
  farePaymentMethod?: PaymentMethod;
  farePaidAt?: string;
  fareCashCollectedBy?: string;
  fareCashCollectedAt?: string;

  createdAt?: string;
  updatedAt?: string;
  timestamp?: unknown;
};

