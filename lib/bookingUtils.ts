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
  operatorId?: string;
  serviceType?: string;
  routeId?: string;
  universityId?: string;
  districtPickupPointId?: string;
  universityPickupPointId?: string;
  journeyDirection?: JourneyDirection;
  homeDistrict?: string;
  journeyOrigin?: string;
  journeyDestination?: string;
  rentalEndDate?: string;
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

const SNAKE_TO_CAMEL: Record<string, keyof BookingRecord> = {
  booking_id: "bookingId",
  trip_id: "tripId",
  student_id: "studentId",
  travel_date: "travelDate",
  booking_type: "bookingType",
  created_at: "createdAt",
  updated_at: "updatedAt",
  fare: "fare",
  operator_id: "operatorId",
  service_type: "serviceType",
  route_id: "routeId",
  university_id: "universityId",
  district_pickup_point_id: "districtPickupPointId",
  university_pickup_point_id: "universityPickupPointId",
  journey_direction: "journeyDirection",
  home_district: "homeDistrict",
  journey_origin: "journeyOrigin",
  journey_destination: "journeyDestination",
  rental_end_date: "rentalEndDate",
  referral_code: "referralCode",
  ambassador_id: "ambassadorId",
  referral_source: "referralSource",
  commission_amount: "commissionAmount",
  referral_status: "referralStatus",
  payment_status: "paymentStatus",
  payment_confirmed_at: "paymentConfirmedAt",
  receipt_number: "receiptNumber",
  receipt_sent: "receiptSent",
  payment_notes: "paymentNotes",
  booking_fee_amount: "bookingFeeAmount",
  booking_fee_status: "bookingFeeStatus",
  booking_fee_paid_at: "bookingFeePaidAt",
  booking_expires_at: "bookingExpiresAt",
  fare_status: "fareStatus",
  fare_payment_method: "farePaymentMethod",
  fare_paid_at: "farePaidAt",
  fare_cash_collected_by: "fareCashCollectedBy",
  fare_cash_collected_at: "fareCashCollectedAt",
};

const CAMEL_TO_SNAKE: Record<string, string> = {
  bookingId: "booking_id",
  tripId: "trip_id",
  studentId: "student_id",
  travelDate: "travel_date",
  bookingType: "booking_type",
  createdAt: "created_at",
  updatedAt: "updated_at",
  fare: "fare",
  operatorId: "operator_id",
  serviceType: "service_type",
  routeId: "route_id",
  universityId: "university_id",
  districtPickupPointId: "district_pickup_point_id",
  universityPickupPointId: "university_pickup_point_id",
  journeyDirection: "journey_direction",
  homeDistrict: "home_district",
  journeyOrigin: "journey_origin",
  journeyDestination: "journey_destination",
  rentalEndDate: "rental_end_date",
  referralCode: "referral_code",
  ambassadorId: "ambassador_id",
  referralSource: "referral_source",
  commissionAmount: "commission_amount",
  referralStatus: "referral_status",

  paymentStatus: "payment_status",
  paymentConfirmedAt: "payment_confirmed_at",
  receiptNumber: "receipt_number",
  receiptSent: "receipt_sent",
  paymentNotes: "payment_notes",
  bookingFeeAmount: "booking_fee_amount",
  bookingFeeStatus: "booking_fee_status",
  bookingFeePaidAt: "booking_fee_paid_at",
  bookingExpiresAt: "booking_expires_at",
  fareStatus: "fare_status",
  farePaymentMethod: "fare_payment_method",
  farePaidAt: "fare_paid_at",
  fareCashCollectedBy: "fare_cash_collected_by",
  fareCashCollectedAt: "fare_cash_collected_at",
};

function toSafeString(value: unknown): string | undefined {
  if (value == null) return undefined;
  const str = String(value).trim();
  return str ? str : undefined;
}

function toSafeNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 1;
}

function toSafePositiveNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

function toSafeNonNegativeNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return undefined;
}

export function normalizeBookingRecord(record: Record<string, unknown> | null | undefined): BookingRecord {
  if (!record) return {};

  const normalized: BookingRecord = {};

  for (const [key, value] of Object.entries(record)) {
    if (key in SNAKE_TO_CAMEL) {
      const camelKey = SNAKE_TO_CAMEL[key];
      if (camelKey === "bookingId") normalized.bookingId = toSafeString(value);
      else if (camelKey === "tripId") normalized.tripId = toSafeString(value);
      else if (camelKey === "studentId") normalized.studentId = toSafeString(value);
      else if (camelKey === "travelDate") normalized.travelDate = toSafeString(value);
      else if (camelKey === "bookingType") normalized.bookingType = toSafeString(value);
      else if (camelKey === "createdAt") normalized.createdAt = toSafeString(value);
      else if (camelKey === "updatedAt") normalized.updatedAt = toSafeString(value);
      else if (camelKey === "fare") {
        const parsedFare = Number(value);
        if (Number.isFinite(parsedFare) && parsedFare > 0) normalized.fare = parsedFare;
      }
      else if (camelKey === "operatorId") normalized.operatorId = toSafeString(value);
      else if (camelKey === "serviceType") normalized.serviceType = toSafeString(value);
      else if (camelKey === "routeId") normalized.routeId = toSafeString(value);
      else if (camelKey === "universityId") normalized.universityId = toSafeString(value);
      else if (camelKey === "districtPickupPointId") normalized.districtPickupPointId = toSafeString(value);
      else if (camelKey === "universityPickupPointId") normalized.universityPickupPointId = toSafeString(value);
      else if (camelKey === "journeyDirection") normalized.journeyDirection = toSafeString(value) as JourneyDirection | undefined;
      else if (camelKey === "homeDistrict") normalized.homeDistrict = toSafeString(value);
      else if (camelKey === "journeyOrigin") normalized.journeyOrigin = toSafeString(value);
      else if (camelKey === "journeyDestination") normalized.journeyDestination = toSafeString(value);
      else if (camelKey === "rentalEndDate") normalized.rentalEndDate = toSafeString(value);
      else if (camelKey === "paymentStatus") normalized.paymentStatus = (toSafeString(value) as PaymentStatus | undefined) || "Pending";
      else if (camelKey === "paymentConfirmedAt") normalized.paymentConfirmedAt = toSafeString(value);
      else if (camelKey === "receiptNumber") normalized.receiptNumber = toSafeString(value);
      else if (camelKey === "receiptSent") {
        if (typeof value === "boolean") normalized.receiptSent = value;
        else if (typeof value === "string") normalized.receiptSent = value === "true";
        else normalized.receiptSent = undefined;
      }
      else if (camelKey === "paymentNotes") normalized.paymentNotes = toSafeString(value);
      else if (camelKey === "bookingFeeAmount") normalized.bookingFeeAmount = toSafeNonNegativeNumber(value);
      else if (camelKey === "bookingFeeStatus") normalized.bookingFeeStatus = (toSafeString(value) as BookingFeeStatus | undefined) || "unpaid";
      else if (camelKey === "bookingFeePaidAt") normalized.bookingFeePaidAt = toSafeString(value);
      else if (camelKey === "bookingExpiresAt") normalized.bookingExpiresAt = toSafeString(value);
      else if (camelKey === "fareStatus") normalized.fareStatus = (toSafeString(value) as FareStatus | undefined) || "unpaid";
      else if (camelKey === "farePaymentMethod") normalized.farePaymentMethod = toSafeString(value) as PaymentMethod | undefined;
      else if (camelKey === "farePaidAt") normalized.farePaidAt = toSafeString(value);
      else if (camelKey === "fareCashCollectedBy") normalized.fareCashCollectedBy = toSafeString(value);
      else if (camelKey === "fareCashCollectedAt") normalized.fareCashCollectedAt = toSafeString(value);
    } else if (key === "id") {
      normalized.bookingId = toSafeString(value);
    } else if (key in CAMEL_TO_SNAKE) {
      const camelKey = key as keyof BookingRecord;
      if (camelKey === "bookingId") normalized.bookingId = toSafeString(value);
      else if (camelKey === "tripId") normalized.tripId = toSafeString(value);
      else if (camelKey === "studentId") normalized.studentId = toSafeString(value);
      else if (camelKey === "travelDate") normalized.travelDate = toSafeString(value);
      else if (camelKey === "bookingType") normalized.bookingType = toSafeString(value);
      else if (camelKey === "createdAt") normalized.createdAt = toSafeString(value);
      else if (camelKey === "updatedAt") normalized.updatedAt = toSafeString(value);
      else if (camelKey === "fare") {
        const parsedFare = Number(value);
        if (Number.isFinite(parsedFare) && parsedFare > 0) normalized.fare = parsedFare;
      }
      else if (camelKey === "operatorId") normalized.operatorId = toSafeString(value);
      else if (camelKey === "serviceType") normalized.serviceType = toSafeString(value);
      else if (camelKey === "routeId") normalized.routeId = toSafeString(value);
      else if (camelKey === "universityId") normalized.universityId = toSafeString(value);
      else if (camelKey === "districtPickupPointId") normalized.districtPickupPointId = toSafeString(value);
      else if (camelKey === "universityPickupPointId") normalized.universityPickupPointId = toSafeString(value);
      else if (camelKey === "journeyDirection") normalized.journeyDirection = toSafeString(value) as JourneyDirection | undefined;
      else if (camelKey === "homeDistrict") normalized.homeDistrict = toSafeString(value);
      else if (camelKey === "journeyOrigin") normalized.journeyOrigin = toSafeString(value);
      else if (camelKey === "journeyDestination") normalized.journeyDestination = toSafeString(value);
      else if (camelKey === "rentalEndDate") normalized.rentalEndDate = toSafeString(value);
      else if (camelKey === "paymentStatus") normalized.paymentStatus = (toSafeString(value) as PaymentStatus | undefined) || "Pending";
      else if (camelKey === "paymentConfirmedAt") normalized.paymentConfirmedAt = toSafeString(value);
      else if (camelKey === "receiptNumber") normalized.receiptNumber = toSafeString(value);
      else if (camelKey === "receiptSent") {
        if (typeof value === "boolean") normalized.receiptSent = value;
        else if (typeof value === "string") normalized.receiptSent = value === "true";
        else normalized.receiptSent = undefined;
      }
      else if (camelKey === "paymentNotes") normalized.paymentNotes = toSafeString(value);
      else if (camelKey === "bookingFeeAmount") normalized.bookingFeeAmount = toSafeNonNegativeNumber(value);
      else if (camelKey === "bookingFeeStatus") normalized.bookingFeeStatus = (toSafeString(value) as BookingFeeStatus | undefined) || "unpaid";
      else if (camelKey === "bookingFeePaidAt") normalized.bookingFeePaidAt = toSafeString(value);
      else if (camelKey === "bookingExpiresAt") normalized.bookingExpiresAt = toSafeString(value);
      else if (camelKey === "fareStatus") normalized.fareStatus = (toSafeString(value) as FareStatus | undefined) || "unpaid";
      else if (camelKey === "farePaymentMethod") normalized.farePaymentMethod = toSafeString(value) as PaymentMethod | undefined;
      else if (camelKey === "farePaidAt") normalized.farePaidAt = toSafeString(value);
      else if (camelKey === "fareCashCollectedBy") normalized.fareCashCollectedBy = toSafeString(value);
      else if (camelKey === "fareCashCollectedAt") normalized.fareCashCollectedAt = toSafeString(value);
    } else if (key === "name") {
      normalized.name = toSafeString(value);
    } else if (key === "phone") {
      normalized.phone = toSafeString(value);
    } else if (key === "email") {
      normalized.email = toSafeString(value);
    } else if (key === "destination") {
      normalized.destination = toSafeString(value);
    } else if (key === "pickup") {
      normalized.pickup = toSafeString(value);
    } else if (key === "location") {
      normalized.location = toSafeString(value);
    } else if (key === "fare") {
      const parsedFare = Number(value);
      if (Number.isFinite(parsedFare) && parsedFare > 0) normalized.fare = parsedFare;
    } else if (key === "referral_code") {
      normalized.referralCode = toSafeString(value);
    } else if (key === "ambassador_id") {
      normalized.ambassadorId = toSafeString(value);
    } else if (key === "referral_source") {
      normalized.referralSource = toSafeString(value);
    } else if (key === "commission_amount") {
      const parsedCommission = Number(value);
      if (Number.isFinite(parsedCommission)) normalized.commissionAmount = parsedCommission;
    } else if (key === "referral_status") {
      normalized.referralStatus = toSafeString(value);
    } else if (key === "status") {
      const rawStatus = toSafeString(value)?.toLowerCase();
      if (rawStatus === "pending") {
        normalized.status = "Booked";
      } else if (rawStatus === "departed") {
        normalized.status = "Departed";
      } else if (rawStatus === "en route" || rawStatus === "in route") {
        normalized.status = "Boarding";
      } else {
        normalized.status = (toSafeString(value) as JourneyStatus | undefined) || "Booked";
      }
    } else if (key === "payment_status") {
      normalized.paymentStatus = (toSafeString(value) as PaymentStatus | undefined) || "Pending";
    } else if (key === "payment_confirmed_at") {
      normalized.paymentConfirmedAt = toSafeString(value);
    } else if (key === "receipt_number") {
      normalized.receiptNumber = toSafeString(value);
    } else if (key === "receipt_sent") {
      // Supabase may return boolean already, but be defensive
      if (typeof value === "boolean") normalized.receiptSent = value;
      else if (typeof value === "string") normalized.receiptSent = value === "true";
      else normalized.receiptSent = undefined;
    } else if (key === "payment_notes") {
      normalized.paymentNotes = toSafeString(value);
    } else if (key === "seats") {
      normalized.seats = toSafeNumber(value);
    } else if (key === "timestamp") {
      normalized.timestamp = value;
    }
  }

  if (!normalized.status) {
    normalized.status = "Booked";
  }

  if (!normalized.paymentStatus) {
    normalized.paymentStatus = "Pending";
  }

  if (!normalized.bookingFeeStatus) {
    normalized.bookingFeeStatus = "unpaid";
  }

  if (!normalized.fareStatus) {
    normalized.fareStatus = "unpaid";
  }

  return normalized;
}

export function toSupabaseBookingPayload(
  input: Record<string, unknown>,
  bookingId: string,
  tripId: string,
  status = "Booked"
) {
  return {
    booking_id: bookingId,
    trip_id: tripId,
    name: toSafeString(input.name) ?? "",
    phone: toSafeString(input.phone) ?? "",
    email: toSafeString(input.email),
    student_id: toSafeString(input.studentId) ?? "",
    destination: toSafeString(input.destination) ?? "",
    travel_date: toSafeString(input.travelDate) ?? "",
    seats: toSafeNumber(input.seats || 1),
    pickup: toSafeString(input.pickup) ?? "Mzuzu University",
    location: toSafeString(input.location) ?? "Campus",

    // Journey status only
    status,

    // Payment status independent (legacy combined field)
    payment_status: "Pending",

    fare: toSafePositiveNumber(input.fare),
    operator_id: toSafeString(input.operatorId),
    service_type: toSafeString(input.serviceType) ?? "intercity",
    route_id: toSafeString(input.routeId),
    university_id: toSafeString(input.universityId),
    district_pickup_point_id: toSafeString(input.districtPickupPointId),
    university_pickup_point_id: toSafeString(input.universityPickupPointId),
    journey_direction: toSafeString(input.journeyDirection),
    home_district: toSafeString(input.homeDistrict),
    journey_origin: toSafeString(input.journeyOrigin),
    journey_destination: toSafeString(input.journeyDestination),
    rental_end_date: toSafeString(input.rentalEndDate),
    booking_type: toSafeString(input.bookingType) ?? "Online",
    referral_code: toSafeString(input.referralCode),
    ambassador_id: toSafeString(input.ambassadorId),
    referral_source: toSafeString(input.referralSource),
    commission_amount: toSafePositiveNumber(input.commissionAmount),
    referral_status: toSafeString(input.referralStatus) ?? "pending",

    // Booking fee / fare split (see db/migrations/2026_08_01_payments_wallet_audit_foundation.sql)
    booking_fee_amount: toSafeNonNegativeNumber(input.bookingFeeAmount),
    booking_fee_status: "unpaid",
    fare_status: "unpaid",
    booking_expires_at: toSafeString(input.bookingExpiresAt),
  };
}

// How long an unpaid booking holds its place before the (not-yet-built) expiry
// job would release it. Not yet configurable via system settings — Phase 7.
export const DEFAULT_BOOKING_FEE_EXPIRY_HOURS = 48;

export function computeBookingExpiryIso(fromDate: Date = new Date()): string {
  return new Date(fromDate.getTime() + DEFAULT_BOOKING_FEE_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();
}

export function generateBookingId(): string {
  return `BK-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export function generateTripId(destination = "", travelDate = ""): string {
  const normalizedDestination = String(destination || "UNKNOWN")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "UNKNOWN";

  const normalizedDate = String(travelDate || "")
    .trim()
    .replace(/[^0-9]/g, "");

  const datePart = normalizedDate.length >= 8 ? normalizedDate.slice(0, 8) : `${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;

  return `TRIP-${datePart}-${normalizedDestination}-01`;
}
