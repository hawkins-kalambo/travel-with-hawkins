import "server-only";

const MALAWI_PHONE_PATTERN = /^(?:\+?265|0)(?:8[0-9]|9[0-9])\d{7}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type ValidatedBookingInput = {
  name: string;
  email?: string;
  phone: string;
  destination: string;
  travelDate: string;
  studentId: string;
  seats: number;
  pickup: string;
  location: string;
  bookingType: string;
  referralCode?: string;
};

export type BookingValidationResult =
  | { success: true; data: ValidatedBookingInput }
  | { success: false; error: string };

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";

  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function normalizeMalawiPhone(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;

  const compact = value.trim().replace(/[\s().-]/g, "");
  if (!MALAWI_PHONE_PATTERN.test(compact)) return undefined;

  if (compact.startsWith("+265")) return compact;
  if (compact.startsWith("265")) return `+${compact}`;
  return `+265${compact.slice(1)}`;
}

export function validateBookingInput(payload: Record<string, unknown>): BookingValidationResult {
  const name = cleanText(payload.name, 100);
  const rawEmail = cleanText(payload.email, 254).toLowerCase();
  const phone = normalizeMalawiPhone(payload.phone);
  const destination = cleanText(payload.destination, 120);
  const travelDate = cleanText(payload.travelDate, 10);
  const studentId = cleanText(payload.studentId, 50);
  const pickup = cleanText(payload.pickup, 120) || "Mzuzu University";
  const location = cleanText(payload.location, 120) || "Campus";
  const bookingType = cleanText(payload.bookingType, 30) || "Online";
  const referralCode = cleanText(payload.referralCode ?? payload.referral_code, 50).toUpperCase() || undefined;
  const seats = typeof payload.seats === "number" ? payload.seats : Number(payload.seats);

  if (name.length < 2 || !/^[\p{L}\p{M}][\p{L}\p{M}\s.'’-]*$/u.test(name)) {
    return { success: false, error: "Please enter a valid name." };
  }
  if (rawEmail && !EMAIL_PATTERN.test(rawEmail)) {
    return { success: false, error: "Please enter a valid email address." };
  }
  if (!phone) {
    return { success: false, error: "Please enter a valid Malawi phone number." };
  }
  if (!destination || destination.length < 2) {
    return { success: false, error: "Please enter a valid destination." };
  }
  if (!DATE_PATTERN.test(travelDate) || Number.isNaN(Date.parse(`${travelDate}T00:00:00Z`))) {
    return { success: false, error: "Please enter a valid travel date." };
  }
  if (!studentId) {
    return { success: false, error: "Please enter a valid student ID." };
  }
  if (!Number.isInteger(seats) || seats < 1 || seats > 10) {
    return { success: false, error: "Seats must be a whole number between 1 and 10." };
  }
  if (referralCode && !/^[A-Z0-9_-]+$/.test(referralCode)) {
    return { success: false, error: "Please enter a valid referral code." };
  }

  return {
    success: true,
    data: {
      name,
      email: rawEmail || undefined,
      phone,
      destination,
      travelDate,
      studentId,
      seats,
      pickup,
      location,
      bookingType,
      referralCode,
    },
  };
}
