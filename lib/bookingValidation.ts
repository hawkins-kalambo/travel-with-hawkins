import "server-only";

import { normalizeMalawiPhone } from "@/lib/phoneNumbers";
import { isJourneyDirection, type JourneyDirection } from "@/lib/journeyDirection";
import { MALAWI_DISTRICTS } from "@/lib/tripSearchData";

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
  journeyDirection: JourneyDirection;
  homeDistrict?: string;
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
  const journeyDirection = isJourneyDirection(payload.journeyDirection ?? payload.journey_direction)
    ? (payload.journeyDirection ?? payload.journey_direction) as JourneyDirection
    : "to_university";
  const homeDistrict = cleanText(payload.homeDistrict ?? payload.home_district, 80) || undefined;

  if (name.length < 2 || !/^[\p{L}\p{M}][\p{L}\p{M}\s.'\u2019-]*$/u.test(name)) {
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
  if (!Number.isInteger(seats) || seats < 1 || seats > 10) {
    return { success: false, error: "Seats must be a whole number between 1 and 10." };
  }
  if (referralCode && !/^[A-Z0-9_-]+$/.test(referralCode)) {
    return { success: false, error: "Please enter a valid referral code." };
  }
  if (homeDistrict && !(MALAWI_DISTRICTS as readonly string[]).includes(homeDistrict)) {
    return { success: false, error: "Please select a valid Malawi home district." };
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
      journeyDirection,
      homeDistrict,
    },
  };
}
