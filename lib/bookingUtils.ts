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
};

const CAMEL_TO_SNAKE: Record<string, string> = {
  bookingId: "booking_id",
  tripId: "trip_id",
  studentId: "student_id",
  travelDate: "travel_date",
  bookingType: "booking_type",
  createdAt: "created_at",
  updatedAt: "updated_at",

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

    booking_type: toSafeString(input.bookingType) ?? "Online",
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
