import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendBookingEmail, sendEmail } from "@/lib/resend";
import { logError, logInfo, logWarn } from "@/lib/logger";
import { resolveRouteFareIfAvailable } from "@/lib/routePricing";
import { sendBookingConfirmationSms } from "@/lib/africasTalking";
import { validateBookingInput } from "@/lib/bookingValidation";
import { isSelfReferral } from "@/lib/selfReferral";
import { normalizeJourneyStatus } from "@/lib/statusUtils";
import { shouldReverseCommission, isCommissionNeedingManualReview, buildCommissionReversalUpdate } from "@/lib/commissionLifecycle";
import {
  generateBookingId,
  generateTripId,
  normalizeBookingRecord,
  toSupabaseBookingPayload,
  computeBookingExpiryIso,
  type BookingRecord,
} from "@/lib/bookingUtils";

export const runtime = "nodejs";

const supabase = supabaseAdmin;
type NotificationStatus = "sent" | "failed" | "skipped";

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

function normalizeRouteName(route: string | undefined): string {
  return (route || "").trim().toLowerCase();
}

async function resolveCommissionAmount(routeName: string, fare: number | undefined, routesText: string): Promise<number> {
  const normalizedRoute = normalizeRouteName(routeName);
  if (!normalizedRoute) return 0;

  const { data, error } = await supabase
    .from("commission_rules")
    .select("route_name, commission_amount, commission_type, status")
    .eq("status", "active");

  if (error) {
    const missingTypeColumn =
      typeof error.message === "string" &&
      error.message.includes("commission_type");

    if (missingTypeColumn) {
      const fallback = await supabase
        .from("commission_rules")
        .select("route_name, commission_amount, status")
        .eq("status", "active");

      if (fallback.error) {
        logWarn("Unable to load commission rules fallback", { error: fallback.error.message });
        return 0;
      }

      const fallbackRule = (fallback.data ?? []).find((rule) => normalizeRouteName(String(rule?.route_name ?? "")) === normalizedRoute);
      const amount = Number(fallbackRule?.commission_amount ?? 0);
      return Number.isFinite(amount) ? amount : 0;
    }

    logWarn("Unable to load commission rules", { error: error.message });
    return 0;
  }

  const matchingRule = (data ?? []).find((rule) => normalizeRouteName(String(rule?.route_name ?? "")) === normalizedRoute);
  const amount = Number(matchingRule?.commission_amount ?? 0);
  const type = typeof matchingRule?.commission_type === "string" ? matchingRule?.commission_type : "fixed";

  if (type === "percentage") {
    const resolvedFare = typeof fare === "number" && Number.isFinite(fare) && fare > 0 ? fare : resolveRouteFareIfAvailable(routeName, routesText);
    if (typeof resolvedFare !== "number" || !Number.isFinite(resolvedFare) || resolvedFare <= 0) return 0;
    return Math.round((resolvedFare * amount) / 100);
  }

  return Number.isFinite(amount) ? amount : 0;
}

function routeObjectsToRoutesText(routeObjects: unknown): string {
  if (!Array.isArray(routeObjects)) return "";
  return routeObjects
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const record = item as Record<string, unknown>;
      const origin = String(record.origin ?? "").trim();
      const destination = String(record.destination ?? "").trim();
      const configuredRouteName = String(record.route_name ?? "").trim();
      const routeName = configuredRouteName || (origin && destination ? `${origin} - ${destination}` : "");
      const fare = Number(record.fare ?? 0);
      if (!routeName || !Number.isFinite(fare) || fare <= 0) return "";
      return `${routeName}: ${fare}`;
    })
    .filter(Boolean)
    .join("\n");
}

function extractRouteSettingsData(settingsData: Record<string, unknown> | null | undefined): string {
  const routesText = typeof settingsData?.routes === "string" ? settingsData.routes : "";
  const routeObjects = settingsData?.route_objects;
  const routeObjectText = routeObjectsToRoutesText(routeObjects);
  return routeObjectText || routesText;
}

async function sendAdminNotification(
  payload: BookingRecord,
  bookingId: string,
  tripId: string,
  fare?: number
): Promise<NotificationStatus> {
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!adminEmail) {
    logWarn("Admin notification skipped because ADMIN_NOTIFICATION_EMAIL is not configured.");
    return "skipped";
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
    return "failed";
  }

  return "sent";
}

async function sendUserConfirmationEmail(
  payload: BookingRecord,
  bookingId: string,
  tripId: string,
  fare?: number
): Promise<NotificationStatus> {
  const userEmail = typeof payload.email === "string" ? payload.email.trim() : "";
  const isValidEmail = userEmail.length > 0 && userEmail.includes("@");

  if (!isValidEmail) {
    logWarn("Skipping user confirmation email because email is missing or invalid", {
      emailProvided: Boolean(userEmail),
    });
    return "skipped";
  }

  logInfo("Booking confirmation email attempted", {
    bookingId,
    tripId,
    destination: payload.destination || "Unknown",
    travelDate: payload.travelDate || "TBD",
    seats: payload.seats || 1,
  });

  // If fare was not provided, try to resolve it from settings so the user sees the amount.
  try {
    if (typeof fare !== "number" || !Number.isFinite(fare) || fare <= 0) {
      const { data: settingsData } = await supabase.from("settings").select("routes, route_objects").order("updated_at", { ascending: false }).limit(1).maybeSingle();
      const resolved = resolveRouteFareIfAvailable(payload.destination, settingsData as Record<string, unknown> | undefined);
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
    return "failed";
  }

  return "sent";
}

// Admin-only: lists all bookings, or looks up one by booking_id. Guests and
// customers must use POST /api/track-booking instead, which verifies the
// booking's own email/phone before returning anything.
export async function GET(req: NextRequest) {
  const response = NextResponse.next();
  const { authorized, error: authError } = await requireAdminUser(req, response);

  if (!authorized) {
    return jsonError(authError || "Unauthorized", 401);
  }

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

    const { data: settingsData } = await supabase.from("settings").select("routes, route_objects").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    const routesText = extractRouteSettingsData(settingsData ?? null);

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

    const validation = validateBookingInput(payload);
    if (!validation.success) return jsonError(validation.error, 400);

    const {
      name,
      email,
      phone,
      destination,
      travelDate,
      studentId,
      seats,
      pickup,
      location,
      bookingType,
      referralCode,
    } = validation.data;

    // Guards against two concurrent submissions of the same booking (a
    // double-click, a retried request) both landing as separate rows. A
    // plain "check, then insert" here would race — two requests could both
    // see no existing match and both insert. claim_booking_dedupe() takes a
    // Postgres advisory lock on the natural key for the duration of the
    // transaction, so only one caller at a time can ever observe an unclaimed
    // key (see db/migrations/2026_08_03_booking_dedupe_claim.sql).
    const dedupeWindowSeconds = 120;
    const dedupeKey = `booking:${phone}|${studentId}|${destination}|${travelDate}|${seats}`;
    const { data: dedupeRows, error: dedupeError } = await supabase.rpc("claim_booking_dedupe", {
      p_key: dedupeKey,
      p_window_seconds: dedupeWindowSeconds,
    });

    if (dedupeError) {
      // Fail open, matching lib/rateLimit.ts's own failure mode — a dedupe
      // check outage must never block legitimate booking submissions.
      logWarn("Booking dedupe claim failed; proceeding without it", { error: dedupeError.message });
    } else {
      const claim = Array.isArray(dedupeRows) ? dedupeRows[0] : dedupeRows;

      if (claim && !claim.claimed) {
        if (claim.existing_booking_id) {
          const { data: existingRow } = await supabase
            .from("bookings")
            .select("*")
            .eq("booking_id", claim.existing_booking_id)
            .maybeSingle();

          // Only echo back full booking details (fare, payment status, etc.)
          // if the email on this submission matches the original — the
          // dedupe key alone (phone+student_id+destination+date+seats) can
          // be known to someone other than the booker.
          if (existingRow && typeof existingRow.email === "string" && existingRow.email.trim().toLowerCase() === email?.trim().toLowerCase()) {
            const existingBooking = normalizeBookingRecord(existingRow as Record<string, unknown>);
            delete (existingBooking as Record<string, unknown>).tripId;
            logInfo("Duplicate booking submission safely reused", { bookingId: existingBooking.bookingId });
            return NextResponse.json({
              success: true,
              booking: existingBooking,
              bookingId: existingBooking.bookingId,
              duplicate: true,
              message: "Booking already received",
              notifications: {
                adminEmail: "skipped",
                customerEmail: "skipped",
                sms: "skipped",
                smsProviderStatus: "duplicate_submission",
              },
            });
          }
        }

        return NextResponse.json({
          success: true,
          duplicate: true,
          message: "This booking was already received. Please check your email for confirmation.",
          notifications: { adminEmail: "skipped", customerEmail: "skipped", sms: "skipped", smsProviderStatus: "duplicate_submission" },
        });
      }
    }

    const bookingId = generateBookingId();
    const tripId = generateTripId(destination, travelDate);
    const { data: settingsData } = await supabase.from("settings").select("routes, route_objects, booking_fee").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    const routesText = extractRouteSettingsData(settingsData ?? null);
    const routeFare = resolveRouteFareIfAvailable(destination, routesText);
    const payloadFare = getPositiveNumber(payload.fare);
    const fare = typeof routeFare === "number" && Number.isFinite(routeFare) && routeFare > 0 ? routeFare : payloadFare;

    // Booking fee is always resolved server-side from settings — the client
    // never gets to decide what it owes.
    const bookingFeeAmount = getPositiveNumber((settingsData as Record<string, unknown> | null)?.booking_fee) ?? 0;
    const bookingExpiresAt = computeBookingExpiryIso();

    let ambassadorId: string | undefined;
    let referralSource: string | undefined;
    let commissionAmount = 0;
    let selfReferralBlocked = false;

    if (referralCode) {
      const { data: ambassadorData, error: ambassadorError } = await supabase
        .from("ambassadors")
        .select("id, referral_code, status, phone, email")
        .eq("referral_code", referralCode.toUpperCase())
        .maybeSingle();

      if (ambassadorError) {
        throw ambassadorError;
      }

      if (!ambassadorData || ambassadorData.status !== "active") {
        return jsonError("Invalid referral code", 400);
      }

      if (isSelfReferral(phone, email, ambassadorData.phone, ambassadorData.email)) {
        // Don't reject the booking — just don't attribute it. The
        // customer isn't doing anything wrong from their own perspective;
        // this only stops an ambassador collecting commission on their
        // own trip. See lib/selfReferral.ts and AMB-003 in the audit.
        selfReferralBlocked = true;
        logWarn("Blocked self-referral attempt", { referralCode: ambassadorData.referral_code, ambassadorId: ambassadorData.id });
      } else {
        ambassadorId = ambassadorData.id;
        referralSource = `referral:${ambassadorData.referral_code}`;
        commissionAmount = await resolveCommissionAmount(destination, fare, routesText);
      }
    }

    const normalizedPayload = {
      ...payload,
      bookingId,
      tripId,
      name,
      email,
      phone,
      destination,
      travelDate,
      studentId,
      seats,
      pickup,
      location,
      bookingType,
      fare,
      referralCode,
      ambassadorId,
      referralSource,
      commissionAmount,
      referralStatus: selfReferralBlocked ? "self_referral_blocked" : referralCode ? "pending" : undefined,
      bookingFeeAmount,
      bookingExpiresAt,
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
      logError("Booking insert failed", {
        code: typeof error.code === "string" ? error.code : "unknown",
      });
      return NextResponse.json(
        { success: false, error: "Booking could not be saved right now. Please try again." },
        { status: 500 }
      );
    }

    // Record the real booking id against the dedupe claim so the next
    // submission within the window (if any) gets a usable existing_booking_id
    // instead of null. Best-effort: a no-op if no claim row exists (e.g. the
    // claim RPC itself failed above and we proceeded without one).
    try {
      await supabase.rpc("finish_booking_dedupe_claim", { p_key: dedupeKey, p_booking_id: bookingId });
    } catch (finishError) {
      logWarn("Failed to finalize booking dedupe claim", { error: finishError instanceof Error ? finishError.message : String(finishError) });
    }

    if (referralCode && ambassadorId) {
      try {
        await supabase.from("referrals").insert([
          {
            ambassador_id: ambassadorId,
            booking_id: bookingId,
            customer_name: name,
            customer_phone: phone,
            route: destination,
            travel_date: travelDate,
            commission_amount: commissionAmount,
            commission_status: "pending",
          },
        ]);
      } catch (referralError) {
        logWarn("Referral record creation failed", { error: referralError instanceof Error ? referralError.message : String(referralError) });
      }
    }

    const record = normalizeBookingRecord(data ?? {});
    const responseBooking = { ...record, fare: fare ?? record.fare };
    delete (responseBooking as Record<string, unknown>).tripId;

    let adminEmailStatus: NotificationStatus = "failed";
    let customerEmailStatus: NotificationStatus = "failed";

    try {
      adminEmailStatus = await sendAdminNotification(record, bookingId, tripId, fare);
    } catch (error) {
      logError("Admin notification execution failed", {
        error: error instanceof Error ? error.message : "Unknown email error",
      });
    }

    try {
      customerEmailStatus = await sendUserConfirmationEmail(record, bookingId, tripId, fare);
    } catch (error) {
      logError("User confirmation email execution failed", {
        error: error instanceof Error ? error.message : "Unknown email error",
      });
    }

    const smsResult = await sendBookingConfirmationSms({ bookingId, name, phone });

    return NextResponse.json({
      success: true,
      booking: responseBooking,
      bookingId,
      message: "Booking created",
      notifications: {
        adminEmail: adminEmailStatus,
        customerEmail: customerEmailStatus,
        sms: smsResult.outcome,
        smsProviderStatus: smsResult.status,
      },
    });
  } catch (error) {
    logError("Booking POST failed", {
      error: error instanceof Error ? error.message : "Unknown booking error",
    });
    return NextResponse.json(
      { success: false, error: "Booking could not be processed right now. Please try again." },
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

    // Commission reversal on cancellation (AMB-002). Only ever moves a
    // pending/approved commission to cancelled — a commission already
    // marked paid is left untouched (real money may have moved) and
    // surfaced for manual admin review instead of being silently reversed.
    let commissionReversal: { reversed: boolean; needsManualReview?: boolean } | undefined;
    if (status && normalizeJourneyStatus(status) === "Cancelled") {
      const { data: referral, error: referralLookupError } = await supabase
        .from("referrals")
        .select("id, commission_status")
        .eq("booking_id", bookingId)
        .maybeSingle();

      if (!referralLookupError && referral) {
        if (shouldReverseCommission("Cancelled", referral.commission_status)) {
          const { error: reversalError } = await supabase
            .from("referrals")
            .update(buildCommissionReversalUpdate("Booking cancelled"))
            .eq("id", referral.id);

          if (reversalError) {
            logError("Failed to reverse commission for cancelled booking", { bookingId, referralId: referral.id, error: reversalError.message });
          } else {
            commissionReversal = { reversed: true };
          }
        } else if (isCommissionNeedingManualReview("Cancelled", referral.commission_status)) {
          commissionReversal = { reversed: false, needsManualReview: true };
          logWarn("Booking cancelled but its commission was already paid — needs manual admin review", { bookingId, referralId: referral.id });
        }
      }
    }

    return NextResponse.json({ success: true, booking: record, message: "Booking updated", commissionReversal });
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

