import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/supabaseServer";
import { createClient } from "@supabase/supabase-js";
import { sendBookingEmail, sendEmail } from "@/lib/resend";
import { logError, logInfo, logWarn } from "@/lib/logger";
import { resolveRouteFareIfAvailable } from "@/lib/routePricing";
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
  // Ensure we have a fare to show in the admin notification. If not provided,
  // attempt to resolve from the latest settings.routes so the admin sees the amount.
  try {
    if (typeof fare !== "number" || !Number.isFinite(fare) || fare <= 0) {
      const { data: settingsData } = await supabase.from("settings").select("routes").order("updated_at", { ascending: false }).limit(1).maybeSingle();
      const routesText = typeof settingsData?.routes === "string" ? settingsData.routes : "";
      const resolved = resolveRouteFareIfAvailable(payload.destination, routesText);
      if (typeof resolved === "number" && Number.isFinite(resolved) && resolved > 0) fare = resolved;
    }
  } catch {
    // fallback to whatever was passed in; this should never block notification sending
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

  // If fare was not provided, try to resolve it from settings so the user sees the amount.
  try {
    if (typeof fare !== "number" || !Number.isFinite(fare) || fare <= 0) {
      const { data: settingsData } = await supabase.from("settings").select("routes").order("updated_at", { ascending: false }).limit(1).maybeSingle();
      const routesText = typeof settingsData?.routes === "string" ? settingsData.routes : "";
      const resolved = resolveRouteFareIfAvailable(payload.destination, routesText);
      if (typeof resolved === "number" && Number.isFinite(resolved) && resolved > 0) fare = resolved;
    }
  } catch {
    // ignore and proceed with whatever fare is available
  }

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

    const settings = await supabase.from("settings").select("routes").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    const routesText = typeof settings.data?.routes === "string" ? settings.data.routes : "";

    const bookings = (data ?? []).map((row) => {
      const booking = normalizeBookingRecord(row as Record<string, unknown>);
      if (typeof booking.fare !== "number" || !Number.isFinite(booking.fare) || booking.fare <= 0) {
        booking.fare = resolveRouteFareIfAvailable(booking.destination, routesText);
      }
      return booking;
    });

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
    const routeFare = resolveRouteFareIfAvailable(destination, routesText);
    const fare = getPositiveNumber(payload.fare) ?? routeFare;
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
      fare,
    };

    const bookingPayload = toSupabaseBookingPayload(normalizedPayload, bookingId, tripId, "Booked");

    const insertResult = await supabase.from("bookings").insert([bookingPayload]).select().single();
    let data = insertResult.data as Record<string, unknown> | null;
    let error = insertResult.error;

    if (error) {
      const reason = String(error?.message || error?.details || error).toLowerCase();
      const missingFareColumn = reason.includes("fare") && (reason.includes("column") || reason.includes("unknown") || reason.includes("undefined"));
      if (missingFareColumn) {
        delete (bookingPayload as Record<string, unknown>).fare;
        const retry = await supabase.from("bookings").insert([bookingPayload]).select().single();
        data = retry.data as Record<string, unknown> | null;
        error = retry.error;
      }
    }

    if (error) {
      // Return the real Supabase error to help diagnose production failures.
      // UI is unchanged; this only affects the admin/dev response payload.
      console.error("Booking insert failed", error);
      return NextResponse.json(
        { success: false, error: "Booking could not be saved right now", details: error },
        { status: 500 }
      );
    }

    const record = normalizeBookingRecord(data ?? {});
    const responseBooking = { ...record, fare: fare ?? record.fare };
    delete (responseBooking as Record<string, unknown>).tripId;

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

    return NextResponse.json({ success: true, booking: responseBooking, bookingId, message: "Booking created" });
  } catch (error) {
    console.error("Booking POST failed", error);
    logError("Booking POST failed", { error });
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
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

