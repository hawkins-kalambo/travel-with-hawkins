export type JourneyStatus =
  | "Booked"
  | "Confirmed"
  | "Boarding"
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
      else if (camelKey === "paymentStatus") normalized.paymentStatus = (toSafeString(value) as PaymentStatus | undefined) || "Pending";
      else if (camelKey === "paymentConfirmedAt") normalized.paymentConfirmedAt = toSafeString(value);
      else if (camelKey === "receiptNumber") normalized.receiptNumber = toSafeString(value);
      else if (camelKey === "receiptSent") {
        if (typeof value === "boolean") normalized.receiptSent = value;
        else if (typeof value === "string") normalized.receiptSent = value === "true";
        else normalized.receiptSent = undefined;
      }
      else if (camelKey === "paymentNotes") normalized.paymentNotes = toSafeString(value);
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
      else if (camelKey === "paymentStatus") normalized.paymentStatus = (toSafeString(value) as PaymentStatus | undefined) || "Pending";
      else if (camelKey === "paymentConfirmedAt") normalized.paymentConfirmedAt = toSafeString(value);
      else if (camelKey === "receiptNumber") normalized.receiptNumber = toSafeString(value);
      else if (camelKey === "receiptSent") {
        if (typeof value === "boolean") normalized.receiptSent = value;
        else if (typeof value === "string") normalized.receiptSent = value === "true";
        else normalized.receiptSent = undefined;
      }
      else if (camelKey === "paymentNotes") normalized.paymentNotes = toSafeString(value);
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
      } else if (rawStatus === "departed" || rawStatus === "en route" || rawStatus === "in route") {
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

    // Payment status independent
    payment_status: "Pending",

    fare: toSafePositiveNumber(input.fare),
    booking_type: toSafeString(input.bookingType) ?? "Online",
    referral_code: toSafeString(input.referralCode),
    ambassador_id: toSafeString(input.ambassadorId),
    referral_source: toSafeString(input.referralSource),
    commission_amount: toSafePositiveNumber(input.commissionAmount),
    referral_status: toSafeString(input.referralStatus) ?? "pending",
  };
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
