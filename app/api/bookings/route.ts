import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/supabaseServer";
import { createClient } from "@supabase/supabase-js";
import { sendBookingEmail, sendEmail } from "@/lib/resend";
import { logError, logInfo, logWarn } from "@/lib/logger";
import { resolveRouteFare } from "@/lib/routePricing";
import {
  generateBookingId,
  generateTripId,
  normalizeBookingRecord,
  toSupabaseBookingPayload,
  type BookingRecord,
} from "@/lib/bookingUtils";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function jsonError(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function getBookingId(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

function getPositiveNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

function getNonEmptyString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  return undefined;
}

async function sendAdminNotification(payload: BookingRecord, bookingId: string, tripId: string, fare?: number) {
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!adminEmail) {
    logWarn("Admin notification skipped because ADMIN_NOTIFICATION_EMAIL is not configured.");
    return;
  }

  const result = await sendEmail({
    to: adminEmail,
    subject: `🚐 New Booking: ${payload.destination || "Unknown"}`,
    html: `
      <div style="font-family:Arial;padding:16px">
        <h2>New Booking Received</h2>
        <p><b>Booking ID:</b> ${bookingId}</p>
        <p><b>Trip ID:</b> ${tripId}</p>
        <p><b>Name:</b> ${payload.name || "N/A"}</p>
        <p><b>Phone:</b> ${payload.phone || "N/A"}</p>
        <p><b>Destination:</b> ${payload.destination || "N/A"}</p>
        <p><b>Date:</b> ${payload.travelDate || "N/A"}</p>
        <p><b>Seats:</b> ${payload.seats || 1}</p>
        <p><b>Fare:</b> ${fare != null ? `MWK ${fare.toLocaleString("en-MW")}` : "Pending"}</p>
      </div>
    `,
  });

  if (!result.success) {
    logError("Admin notification failed", { error: result.error });
  }
}

async function sendUserConfirmationEmail(payload: BookingRecord, bookingId: string, tripId: string, fare?: number) {
  const userEmail = typeof payload.email === "string" ? payload.email.trim() : "";
  const isValidEmail = userEmail.length > 0 && userEmail.includes("@");

  if (!isValidEmail) {
    logWarn("Skipping user confirmation email because email is missing or invalid", {
      emailProvided: Boolean(userEmail),
      emailValue: userEmail || null,
    });
    return;
  }

  logInfo("Booking confirmation email attempted", {
    to: userEmail,
    bookingId,
    tripId,
    destination: payload.destination || "Unknown",
    travelDate: payload.travelDate || "TBD",
    seats: payload.seats || 1,
  });

  const result = await sendBookingEmail({
    to: userEmail,
    name: String(payload.name || "Guest"),
    destination: String(payload.destination || "Unknown"),
    travelDate: String(payload.travelDate || "TBD"),
    seats: Number(payload.seats ?? 1),
    fare,
  });

  logInfo("Booking confirmation email result", { result });

  if (!result.success) {
    logError("User confirmation email failed", { error: result.error });
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const trackingId = url.searchParams.get("trackingId");

    let query = supabase.from("bookings").select("*");

    if (trackingId) {
      query = query.eq("booking_id", trackingId).limit(1);
    } else {
      query = query.order("created_at", { ascending: false });
    }

    const { data, error } = await query;
    if (error) throw error;

    const bookings = (data ?? []).map((row) => normalizeBookingRecord(row as Record<string, unknown>));

    return NextResponse.json({
      success: true,
      bookings,
      booking: trackingId ? bookings[0] : null,
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unknown error");
  }
}

export async function POST(req: Request) {
  try {
    let payload: Record<string, unknown> = {};

    try {
      payload = (await req.json()) as Record<string, unknown>;
    } catch {
      payload = {};
    }

    const name = getNonEmptyString(payload.name);
    const phone = getNonEmptyString(payload.phone);
    const destination = getNonEmptyString(payload.destination);
    const travelDate = getNonEmptyString(payload.travelDate);
    const studentId = getNonEmptyString(payload.studentId);
    const seats = getPositiveNumber(payload.seats);

    if (!name || !phone || !destination || !travelDate || !studentId || !seats) {
      return jsonError("name, phone, destination, travelDate, studentId, and seats are required", 400);
    }

    const bookingId = generateBookingId();
    const tripId = generateTripId(destination, travelDate);
    const { data: settingsData } = await supabase.from("settings").select("routes").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    const routesText = typeof settingsData?.routes === "string" ? settingsData.routes : "";
    const fare = getPositiveNumber(payload.fare) ?? resolveRouteFare(destination, routesText, 5000);
    const normalizedPayload = {
      ...payload,
      bookingId,
      tripId,
      name,
      phone,
      destination,
      travelDate,
      studentId,
      seats,
      bookingType: getNonEmptyString(payload.bookingType) || "Online",
    };

    const bookingPayload = {
      ...toSupabaseBookingPayload(normalizedPayload, bookingId, tripId, "Booked"),
      // Only set fare if it is a valid positive number.
      // If the DB schema doesn't have `fare` or it rejects null/undefined, this prevents 500s.
      ...(typeof fare === "number" && Number.isFinite(fare) && fare > 0 ? { fare } : {}),
    };

    const { data, error } = await supabase
      .from("bookings")
      .insert([bookingPayload])
      .select()
      .single();

    if (error) {
      logError("Booking insert failed", { error });
      return jsonError("Booking could not be saved right now", 500);
    }

    const record = normalizeBookingRecord((data as Record<string, unknown>) ?? {});

    try {
      await sendAdminNotification(record, bookingId, tripId, fare);
    } catch (error) {
      logError("Admin notification execution failed", { error });
    }

    try {
      await sendUserConfirmationEmail(record, bookingId, tripId, fare);
    } catch (error) {
      logError("User confirmation email execution failed", { error });
    }

    const customerRecord = { ...record };
    delete (customerRecord as Record<string, unknown>).tripId;

    return NextResponse.json({ success: true, booking: customerRecord, bookingId, message: "Booking created" });
  } catch (error) {
    logError("Booking POST failed", { error });
    return jsonError(error instanceof Error ? error.message : "Unknown error");
  }
}

export async function PATCH(req: NextRequest) {
  const response = NextResponse.next();
  const { authorized, error } = await requireAdminUser(req, response);

  if (!authorized) {
    return jsonError(error || "Unauthorized", 401);
  }

  try {
    const body = await req.json();
    const payload = body as Record<string, unknown>;
    const bookingId = getBookingId(payload.bookingId ?? payload.id);
    const status = getNonEmptyString(payload.status);
    const paymentStatus = getNonEmptyString(payload.paymentStatus);
    const paymentNotes = getNonEmptyString(payload.paymentNotes);

    if (!bookingId) {
      return jsonError("bookingId is required", 400);
    }

    const updatePayload: Record<string, unknown> = {};
    if (status) updatePayload.status = status;
    if (paymentStatus) updatePayload.payment_status = paymentStatus;
    if (paymentNotes !== undefined) updatePayload.payment_notes = paymentNotes;

    if (Object.keys(updatePayload).length === 0) {
      return jsonError("No update fields provided", 400);
    }

    const { data, error } = await supabase
      .from("bookings")
      .update(updatePayload)
      .eq("booking_id", bookingId)
      .select()
      .single();

    if (error) throw error;

    const record = normalizeBookingRecord((data as Record<string, unknown>) ?? {});

    return NextResponse.json({ success: true, booking: record, message: "Booking updated" });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unknown error");
  }
}

export async function DELETE(req: NextRequest) {
  const response = NextResponse.next();
  const { authorized, error } = await requireAdminUser(req, response);

  if (!authorized) {
    return jsonError(error || "Unauthorized", 401);
  }

  try {
    const body = await req.json();
    const payload = body as Record<string, unknown>;
    const bookingId = getBookingId(payload.bookingId ?? payload.id);

    if (!bookingId) {
      return jsonError("bookingId is required", 400);
    }

    const { error } = await supabase.from("bookings").delete().eq("booking_id", bookingId);

    if (error) throw error;

    return NextResponse.json({ success: true, message: "Booking deleted" });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unknown error");
  }
}

