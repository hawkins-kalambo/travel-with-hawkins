import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { DELETE as deleteAdminBooking, GET as getAdminBookings, PATCH as patchAdminBookings } from "@/app/api/admin/bookings/route";
import { sendBookingEmail, sendEmail, sendAmbassadorReferralEmail } from "@/lib/resend";
import { logError, logInfo, logWarn } from "@/lib/logger";
import { sendBookingConfirmationSms, sendAdminBookingAlertSms, sendAmbassadorReferralAlertSms } from "@/lib/africasTalking";
import { validateBookingInput } from "@/lib/bookingValidation";
import { isSelfReferral } from "@/lib/selfReferral";
import { buildJourneyName, getJourneyEndpoints, getJourneyPickupLabel, isJourneyDirection } from "@/lib/journeyDirection";
import { resolveActiveUniversity } from "@/lib/universityResolver";
import { resolveDefaultOperatorId } from "@/lib/defaultOperator";
import { jsonError } from "@/lib/apiResponse";
import { isFeatureEnabled } from "@/lib/featureFlags";
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

async function resolveCommissionAmount(routeName: string, fare: number | undefined): Promise<number> {
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
    if (typeof fare !== "number" || !Number.isFinite(fare) || fare <= 0) return 0;
    return Math.round((fare * amount) / 100);
  }

  return Number.isFinite(amount) ? amount : 0;
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
  return getAdminBookings(req);
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
      destination: submittedDestination,
      travelDate,
      studentId,
      seats,
      pickup: submittedPickup,
      location: submittedLocation,
      bookingType,
      referralCode,
      journeyDirection: submittedJourneyDirection,
      homeDistrict: submittedHomeDistrict,
    } = validation.data;

    let destination = submittedDestination;
    let pickup = submittedPickup;
    let location = submittedLocation;
    let journeyDirection: typeof submittedJourneyDirection | undefined = submittedJourneyDirection;
    let homeDistrict = submittedHomeDistrict;
    let journeyOrigin: string | undefined;
    let journeyDestination: string | undefined;
    let resolvedUniversityId: string | undefined;
    let resolvedDistrictPickupPointId: string | undefined;
    let resolvedUniversityPickupPointId: string | undefined;
    let resolvedRouteCommission: { amount: number; type: "fixed" | "percentage" } | undefined;
    // Set only once the resolved route (university-anchored or public
    // destination_label — both branches below) is confirmed active. Doubles
    // as the "does capacity enforcement apply" flag further down: never set
    // for taxi/car-hire/legacy-university/freeform bookings.
    let resolvedRouteId: string | undefined;
    let resolvedOperatorId: string | undefined;
    let resolvedServiceType: "intercity" | "taxi" | "car_hire" = "intercity";
    let resolvedRentalEndDate: string | undefined;
    const requestedRouteId = getNonEmptyString(payload.routeId ?? payload.route_id);
    const requestedUniversityId = getNonEmptyString(payload.universityId ?? payload.university_id);
    const requestedTaxiFareId = getNonEmptyString(payload.taxiFareId ?? payload.taxi_fare_id);
    const requestedCarHireListingId = getNonEmptyString(payload.carHireListingId ?? payload.car_hire_listing_id);

    const { data: settingsData } = await supabase.from("settings").select("booking_fee, max_seats").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    // Fare starts unresolved for a free-text/custom destination with no
    // matched structured route, taxi fare, or car-hire listing below — an
    // admin sets it manually (PATCH /api/admin/bookings) before the booking
    // fee/fare payment flow. See the comment further down (near
    // initiatePayChanguPayment's "amount_not_configured" rejection) for why
    // this was always the intended behavior for the online-payment path;
    // record_manual_fare_payment() enforces the same requirement for cash.
    let fare: number | undefined;

    // Server-side kill switches (Phase 3 launch-safety controls) — checked
    // before any DB work in each branch. Turning off all four live-service
    // flags at once *is* the emergency global pause; no separate mechanism
    // exists for that on purpose (see db/migrations/2026_08_20_launch_safety_controls.sql).
    const SERVICE_UNAVAILABLE_MESSAGE = "This service is temporarily unavailable. Please try again later or contact support.";

    if (requestedCarHireListingId) {
      if (!(await isFeatureEnabled("car_hire_enabled"))) return jsonError(SERVICE_UNAVAILABLE_MESSAGE, 503);
      const rentalEndDateInput = getNonEmptyString(payload.rentalEndDate ?? payload.rental_end_date);
      if (!rentalEndDateInput || !/^\d{4}-\d{2}-\d{2}$/.test(rentalEndDateInput) || Number.isNaN(Date.parse(`${rentalEndDateInput}T00:00:00Z`))) {
        return jsonError("Please enter a valid return date.", 400);
      }

      const { data: listingRow, error: listingError } = await supabase
        .from("car_hire_listings")
        .select("id, daily_rate, status, operator_id, operator:operators(status), vehicle:vehicles(registration_number, make, model)")
        .eq("id", requestedCarHireListingId)
        .maybeSingle();

      if (listingError) {
        logError("Failed to resolve selected car hire listing", { error: listingError.message, carHireListingId: requestedCarHireListingId });
        return jsonError("Unable to verify the selected car hire listing. Please try again.", 503);
      }
      if (!listingRow) return jsonError("The selected car hire listing no longer exists.", 400);

      const listingOperator = listingRow.operator as unknown as { status?: string } | null;
      if (listingRow.status !== "active" || listingOperator?.status !== "active") {
        return jsonError("The selected car hire listing is not currently available.", 400);
      }

      const pickupDate = new Date(`${travelDate}T00:00:00Z`);
      const returnDate = new Date(`${rentalEndDateInput}T00:00:00Z`);
      const days = Math.round((returnDate.getTime() - pickupDate.getTime()) / 86_400_000) + 1;
      if (days < 1) return jsonError("The return date must be on or after the pickup date.", 400);

      const vehicle = listingRow.vehicle as unknown as { registration_number: string; make: string | null; model: string | null };
      const vehicleLabel = [vehicle.make, vehicle.model].filter(Boolean).join(" ") || vehicle.registration_number;

      resolvedServiceType = "car_hire";
      resolvedOperatorId = listingRow.operator_id;
      resolvedRentalEndDate = rentalEndDateInput;
      destination = `${vehicleLabel} - Car Hire`;
      pickup = vehicleLabel;
      location = "Car Hire";
      journeyDirection = undefined;
      homeDistrict = undefined;

      const dailyRate = Number(listingRow.daily_rate);
      fare = Number.isFinite(dailyRate) && dailyRate > 0 ? dailyRate * days : undefined;
    } else if (requestedTaxiFareId) {
      if (!(await isFeatureEnabled("taxi_enabled"))) return jsonError(SERVICE_UNAVAILABLE_MESSAGE, 503);
      const { data: taxiFareRow, error: taxiFareError } = await supabase
        .from("taxi_fares")
        .select("id, origin_label, destination_label, fare, status, operator_id, operator:operators(status)")
        .eq("id", requestedTaxiFareId)
        .maybeSingle();

      if (taxiFareError) {
        logError("Failed to resolve selected taxi fare", { error: taxiFareError.message, taxiFareId: requestedTaxiFareId });
        return jsonError("Unable to verify the selected taxi fare. Please try again.", 503);
      }
      if (!taxiFareRow) return jsonError("The selected taxi fare no longer exists.", 400);

      const taxiOperator = taxiFareRow.operator as unknown as { status?: string } | null;
      if (taxiFareRow.status !== "active" || taxiOperator?.status !== "active") {
        return jsonError("The selected taxi fare is not currently available.", 400);
      }

      resolvedServiceType = "taxi";
      resolvedOperatorId = taxiFareRow.operator_id;
      destination = `${taxiFareRow.origin_label} - ${taxiFareRow.destination_label}`;
      pickup = taxiFareRow.origin_label;
      location = "Taxi";
      // Taxi has no university/district journey concept — leave these unset
      // rather than keep the intercity default (validateBookingInput
      // defaults journeyDirection to "to_university" for a field this
      // booking type doesn't use at all).
      journeyDirection = undefined;
      homeDistrict = undefined;

      const structuredFare = Number(taxiFareRow.fare);
      fare = Number.isFinite(structuredFare) && structuredFare > 0 ? structuredFare : undefined;
    } else if (requestedRouteId) {
      if (!(await isFeatureEnabled("public_intercity_enabled"))) return jsonError(SERVICE_UNAVAILABLE_MESSAGE, 503);
      const { data: routeRow, error: routeError } = await supabase
        .from("routes")
        .select("id, fare, status, operator_id, university_id, destination_label, pickup_point_id, district_pickup_point_id, origin_district, direction, commission_amount, commission_type, operator:operators(status), university:universities(name, status), pickupPoint:university_pickup_points(label, status), districtPickupPoint:district_pickup_points(district, label, status)")
        .eq("id", requestedRouteId)
        .maybeSingle();

      if (routeError) {
        logError("Failed to resolve selected route", { error: routeError.message, routeId: requestedRouteId });
        return jsonError("Unable to verify the selected route. Please try again.", 503);
      }
      if (!routeRow) return jsonError("The selected route no longer exists.", 400);

      const relation = routeRow as unknown as {
        operator?: { status?: string } | null;
        university?: { name?: string; status?: string } | null;
        pickupPoint?: { label?: string; status?: string } | null;
        districtPickupPoint?: { district?: string; label?: string; status?: string } | null;
      };

      // A plain public destination route (Marketplace Expansion Stage 3) has
      // no university row to anchor to — district_pickup_point_id is
      // optional for these (see docs/route-model-decision.md), so it's only
      // checked for active status when one is actually set.
      const isPublicDestinationRoute = !routeRow.university_id && typeof routeRow.destination_label === "string" && routeRow.destination_label.trim().length > 0;

      const verifiedDirection = isJourneyDirection(routeRow.direction) ? routeRow.direction : "to_university";
      if (verifiedDirection !== submittedJourneyDirection) {
        return jsonError("The selected route does not match this journey. Please search again.", 400);
      }

      const verifiedHomeDistrict = typeof routeRow.origin_district === "string" ? routeRow.origin_district : "";
      if (!verifiedHomeDistrict) return jsonError("The selected route has no home district configured.", 500);

      if (isPublicDestinationRoute) {
        if (
          routeRow.status !== "active"
          || relation.operator?.status !== "active"
          || (relation.districtPickupPoint && relation.districtPickupPoint.status !== "active")
        ) {
          return jsonError("The selected route is not currently available.", 400);
        }

        const destinationLabel = routeRow.destination_label!.trim();
        journeyDirection = verifiedDirection;
        homeDistrict = verifiedHomeDistrict;
        destination = verifiedDirection === "from_university" ? `${destinationLabel} - ${verifiedHomeDistrict}` : `${verifiedHomeDistrict} - ${destinationLabel}`;
        journeyOrigin = verifiedDirection === "from_university" ? destinationLabel : verifiedHomeDistrict;
        journeyDestination = verifiedDirection === "from_university" ? verifiedHomeDistrict : destinationLabel;
        pickup = relation.districtPickupPoint?.label || verifiedHomeDistrict;
        location = verifiedDirection === "from_university" ? destinationLabel : "Home district";
        resolvedUniversityId = undefined;
        resolvedDistrictPickupPointId = routeRow.district_pickup_point_id ?? undefined;
        resolvedUniversityPickupPointId = undefined;
      } else {
        if (
          routeRow.status !== "active"
          || relation.operator?.status !== "active"
          || relation.university?.status !== "active"
          || relation.districtPickupPoint?.status !== "active"
          || (relation.pickupPoint && relation.pickupPoint.status !== "active")
        ) {
          return jsonError("The selected route is not currently available.", 400);
        }

        const universityName = relation.university?.name || "University";
        journeyDirection = verifiedDirection;
        homeDistrict = verifiedHomeDistrict;
        destination = buildJourneyName(verifiedHomeDistrict, universityName, journeyDirection);
        const endpoints = getJourneyEndpoints(verifiedHomeDistrict, universityName, journeyDirection);
        journeyOrigin = endpoints.origin;
        journeyDestination = endpoints.destination;
        pickup = getJourneyPickupLabel(
          journeyDirection,
          relation.districtPickupPoint?.label,
          relation.pickupPoint?.label,
          verifiedHomeDistrict,
          universityName
        );
        location = journeyDirection === "from_university" ? "University" : "Home district";
        resolvedUniversityId = routeRow.university_id ?? undefined;
        resolvedDistrictPickupPointId = routeRow.district_pickup_point_id ?? undefined;
        resolvedUniversityPickupPointId = routeRow.pickup_point_id ?? undefined;
      }

      resolvedRouteId = routeRow.id;
      resolvedOperatorId = routeRow.operator_id ?? undefined;
      const structuredFare = Number(routeRow.fare);
      fare = Number.isFinite(structuredFare) && structuredFare > 0 ? structuredFare : undefined;
      const rawCommissionAmount = Number(routeRow.commission_amount);
      resolvedRouteCommission = {
        amount: Number.isFinite(rawCommissionAmount) && rawCommissionAmount >= 0 ? rawCommissionAmount : 0,
        type: routeRow.commission_type === "percentage" ? "percentage" : "fixed",
      };
    } else if (requestedUniversityId) {
      if (!(await isFeatureEnabled("student_booking_enabled"))) return jsonError(SERVICE_UNAVAILABLE_MESSAGE, 503);
      try {
        const university = await resolveActiveUniversity({ universityId: requestedUniversityId });
        resolvedUniversityId = university.id;

        // A customer-selected university is authoritative. Rebuild the
        // journey label from the verified catalogue record rather than
        // trusting a client-provided destination string.
        if (homeDistrict) {
          destination = buildJourneyName(homeDistrict, university.name, journeyDirection);
          const endpoints = getJourneyEndpoints(homeDistrict, university.name, journeyDirection);
          journeyOrigin = endpoints.origin;
          journeyDestination = endpoints.destination;
          pickup = journeyDirection === "from_university" ? university.name : homeDistrict;
          location = journeyDirection === "from_university" ? "University" : "Home district";
        }
      } catch (error) {
        return jsonError(error instanceof Error ? error.message : "The selected university is not available", 400);
      }
    } else {
      // Pure free-text/custom-destination path — no routeId/taxiFareId/
      // carHireListingId/universityId matched anything. Same student/custom
      // booking flow as the requestedUniversityId branch above, just without
      // a catalogue match, so it's gated by the same flag.
      if (!(await isFeatureEnabled("student_booking_enabled"))) return jsonError(SERVICE_UNAVAILABLE_MESSAGE, 503);
    }

    // Every booking carries an operator (Master Plan §3.3's universal
    // booking model), even ones made through the legacy free-text route
    // matcher that has no operator concept of its own — those attribute to
    // the internal operator every pre-existing route/booking was backfilled
    // onto in Stage 1.
    if (!resolvedOperatorId) {
      resolvedOperatorId = (await resolveDefaultOperatorId()) ?? undefined;
    }

    // Guards against two concurrent submissions of the same booking (a
    // double-click, a retried request) both landing as separate rows. A
    // plain "check, then insert" here would race — two requests could both
    // see no existing match and both insert. claim_booking_dedupe() takes a
    // Postgres advisory lock on the natural key for the duration of the
    // transaction, so only one caller at a time can ever observe an unclaimed
    // key (see db/migrations/2026_08_03_booking_dedupe_claim.sql).
    const dedupeWindowSeconds = 120;
    const dedupeKey = `booking:${phone}|${studentId}|${requestedRouteId || requestedTaxiFareId || requestedCarHireListingId || destination}|${journeyDirection}|${travelDate}|${seats}`;
    // Otherwise the dedupe claim taken below would hold this key for the
    // rest of the window with no booking_id — a legitimate retry (or anyone
    // else with the same natural key) would get a false "already received"
    // response instead of being allowed to actually book. Used both by the
    // existing plain-insert failure path and the new capacity-checked path.
    const releaseDedupeClaim = async () => {
      try {
        await supabase.rpc("release_booking_dedupe_claim", { p_key: dedupeKey });
      } catch (releaseError) {
        logWarn("Failed to release booking dedupe claim after failure", { error: releaseError instanceof Error ? releaseError.message : String(releaseError) });
      }
    };
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
    // Fare is only ever resolved server-side from the configured routes —
    // never from the client. The booking form doesn't send `fare` in its
    // request body at all, so payload.fare had no legitimate caller; it
    // was pure attack surface (a destination string that doesn't match a
    // configured route, paired with an attacker-chosen fare). Leaving fare
    // unset here is safe: initiatePayChanguPayment() already rejects with
    // "amount_not_configured" if a booking has no valid fare, rather than
    // trusting whatever the client sent.
    // If the client identified a specific structured route (the district ->
    // university trip-search flow), that's authoritative and overrides the
    // fuzzy-matched fare above — same "never trust the client's number"
    // rule applies: only the route's own `fare` column is used, and only
    // once both the route and its university are confirmed active server-
    // side (an inactive/draft route, e.g. a LUANAR leg with a placeholder
    // fare pre-launch, must never be bookable just because its id leaked
    // into a request).
    // Set only once the route above has been verified active — carries the
    // route's own commission fields so the referral block below can use
    // them instead of the string-keyed commission_rules lookup, which never
    // matches this flow's "District - University (CODE)" destination text.
    // Booking fee is always resolved server-side from settings — the client
    // never gets to decide what it owes.
    const bookingFeeAmount = getPositiveNumber((settingsData as Record<string, unknown> | null)?.booking_fee) ?? 0;
    const bookingExpiresAt = computeBookingExpiryIso();

    let ambassadorId: string | undefined;
    let ambassadorUniversityId: string | undefined;
    let referralSource: string | undefined;
    let commissionAmount = 0;
    let selfReferralBlocked = false;
    // Hoisted out of the `if (referralCode)` block below so the referral
    // notification (fired after the booking + referrals row are actually
    // persisted, further down) still has the ambassador's contact info to
    // send to -- ambassadorData itself goes out of scope at the end of that
    // block.
    let ambassadorPhone: string | null | undefined;
    let ambassadorEmail: string | null | undefined;
    let ambassadorName: string | null | undefined;

    if (referralCode) {
      const { data: ambassadorData, error: ambassadorError } = await supabase
        .from("ambassadors")
        .select("id, referral_code, status, phone, email, full_name, university_id")
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
        ambassadorUniversityId = ambassadorData.university_id || undefined;
        referralSource = `referral:${ambassadorData.referral_code}`;
        ambassadorPhone = ambassadorData.phone;
        ambassadorEmail = ambassadorData.email;
        ambassadorName = ambassadorData.full_name;
        // A resolved structured route is authoritative for commission too —
        // it's fully self-describing (fare + commission on the one row an
        // admin edits). Only falls back to the string-keyed commission_rules
        // lookup for the legacy/custom-destination flow, unchanged from before.
        if (resolvedRouteCommission) {
          commissionAmount =
            resolvedRouteCommission.type === "percentage"
              ? Math.round(((fare ?? 0) * resolvedRouteCommission.amount) / 100)
              : resolvedRouteCommission.amount;
        } else {
          commissionAmount = await resolveCommissionAmount(destination, fare);
        }
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
      operatorId: resolvedOperatorId,
      serviceType: resolvedServiceType,
      // Only ever stamped once the route has been verified active above —
      // an unresolved or rejected routeId is dropped rather than recorded,
      // so a booking never references a route that wasn't actually live
      // when it was made.
      routeId: resolvedRouteId,
      universityId: resolvedUniversityId,
      districtPickupPointId: resolvedDistrictPickupPointId,
      universityPickupPointId: resolvedUniversityPickupPointId,
      journeyDirection,
      homeDistrict,
      journeyOrigin,
      journeyDestination,
      rentalEndDate: resolvedRentalEndDate,
      referralCode,
      ambassadorId,
      referralSource,
      commissionAmount,
      referralStatus: selfReferralBlocked ? "self_referral_blocked" : referralCode ? "pending" : undefined,
      bookingFeeAmount,
      bookingExpiresAt,
    };

    const bookingPayload = toSupabaseBookingPayload(normalizedPayload, bookingId, tripId, "Booked");

    let data: Record<string, unknown> | null = null;
    let error: { message?: string; code?: string; details?: string } | null = null;

    if (resolvedRouteId) {
      // Capacity-checked path for intercity structured-route bookings (both
      // university-anchored and public destination_label routes) — reuses
      // the WhatsApp booking flow's capacity infrastructure (see
      // db/migrations/2026_08_10_whatsapp_customer_service.sql, extended by
      // db/migrations/2026_08_19_web_capacity_and_booking_expiry.sql). Taxi,
      // car-hire, and any unresolved/legacy path fall through to the plain
      // insert below, unchanged — no capacity concept for them yet.
      //
      // Deliberately fails closed (unlike claim_booking_dedupe's fail-open
      // design above): an outage here blocks the booking rather than
      // silently skipping the capacity check, since the entire point of
      // this path is "never oversell."
      const defaultCapacity = getPositiveNumber((settingsData as Record<string, unknown> | null)?.max_seats);

      const { data: depRows, error: depError } = await supabase.rpc("get_or_create_route_departure", {
        p_route_id: resolvedRouteId,
        p_travel_date: travelDate,
        p_default_capacity: defaultCapacity ?? null,
      });
      const departure = Array.isArray(depRows) ? depRows[0] : depRows;

      if (depError) {
        await releaseDedupeClaim();
        logError("get_or_create_route_departure failed", { error: depError.message });
        return jsonError("Booking could not be processed right now. Please try again.", 500);
      }
      if (!departure || departure.outcome !== "ready") {
        await releaseDedupeClaim();
        return jsonError("The selected travel date is not currently available. Please choose another date.", 400);
      }

      const { data: rpcRows, error: rpcError } = await supabase.rpc("create_capacity_checked_booking", {
        p_operation_key: `web:${bookingId}`,
        p_booking_id: bookingId,
        p_trip_id: tripId,
        p_departure_id: departure.departure_id,
        p_name: name,
        p_phone: phone,
        p_email: email ?? "",
        p_student_id: studentId ?? "",
        p_seats: seats,
        p_destination: destination,
        p_pickup: pickup,
        p_location: location,
        p_booking_type: bookingType,
        p_booking_source: "web",
      });
      const rpc = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;

      if (rpcError) {
        await releaseDedupeClaim();
        logError("create_capacity_checked_booking failed", { error: rpcError.message });
        return jsonError("Booking could not be saved right now. Please try again.", 500);
      }
      if (!rpc || rpc.outcome === "rejected") {
        await releaseDedupeClaim();
        const reason = rpc?.reason;
        const message =
          reason === "insufficient_seats"
            ? "Sorry, there aren't enough seats left for this date. Please try another date or fewer seats."
            : "The selected route is not currently available. Please try again.";
        return jsonError(message, 400);
      }

      // The RPC's own insert only sets the columns it needs to be
      // transactionally correct (capacity + idempotency) — everything else
      // (operator/journey/referral display fields) gets a best-effort,
      // non-transactional follow-up write here, same as the referrals
      // insert further below already is. Logged-but-non-fatal on failure.
      const { data: readback, error: readbackError } = await supabase.from("bookings").select("*").eq("booking_id", rpc.booking_id).maybeSingle();
      data = readback as Record<string, unknown> | null;
      error = readbackError;

      if (data) {
        const { data: patched, error: patchError } = await supabase
          .from("bookings")
          .update({
            operator_id: resolvedOperatorId,
            service_type: resolvedServiceType,
            district_pickup_point_id: resolvedDistrictPickupPointId,
            university_pickup_point_id: resolvedUniversityPickupPointId,
            journey_direction: journeyDirection,
            home_district: homeDistrict,
            journey_origin: journeyOrigin,
            journey_destination: journeyDestination,
            referral_code: referralCode,
            ambassador_id: ambassadorId,
            referral_source: referralSource,
            commission_amount: commissionAmount,
            referral_status: selfReferralBlocked ? "self_referral_blocked" : referralCode ? "pending" : undefined,
          })
          .eq("booking_id", rpc.booking_id)
          .select()
          .single();

        if (patchError) {
          logWarn("Non-capacity booking field parity update failed", { error: patchError.message });
        } else if (patched) {
          data = patched as Record<string, unknown>;
        }
      }
    } else {
      const insertResult = await supabase.from("bookings").insert([bookingPayload]).select().single();
      data = insertResult.data as Record<string, unknown> | null;
      error = insertResult.error;

      if (error) {
        const reason = String(error?.message || error?.details || error).toLowerCase();
        const missingFareColumn = reason.includes("fare") && (reason.includes("column") || reason.includes("unknown") || reason.includes("undefined"));
        // route_id/university_id are new (2026_08_04_universities_and_structured_routes.sql) —
        // fail open the same way the fare column already does if that migration
        // hasn't been applied to this environment yet, rather than blocking every booking.
        const missingRouteColumns =
          (reason.includes("route_id") || reason.includes("university_id")) &&
          (reason.includes("column") || reason.includes("unknown") || reason.includes("undefined"));
        // operator_id/service_type are new (2026_08_10_bookings_operator_service_type.sql) —
        // same fail-open treatment as route_id/university_id above.
        const missingOperatorColumns =
          (reason.includes("operator_id") || reason.includes("service_type")) &&
          (reason.includes("column") || reason.includes("unknown") || reason.includes("undefined"));
        // rental_end_date is new (2026_08_11_car_hire_listings.sql) — same
        // fail-open treatment; a missing column here would otherwise block
        // every booking, not just car-hire ones, since it's always present
        // (if undefined) on the insert payload.
        const missingRentalEndDateColumn =
          reason.includes("rental_end_date") && (reason.includes("column") || reason.includes("unknown") || reason.includes("undefined"));

        if (missingFareColumn) delete (bookingPayload as Record<string, unknown>).fare;
        if (missingRouteColumns) {
          delete (bookingPayload as Record<string, unknown>).route_id;
          delete (bookingPayload as Record<string, unknown>).university_id;
        }
        if (missingOperatorColumns) {
          delete (bookingPayload as Record<string, unknown>).operator_id;
          delete (bookingPayload as Record<string, unknown>).service_type;
        }
        if (missingRentalEndDateColumn) delete (bookingPayload as Record<string, unknown>).rental_end_date;

        if (missingFareColumn || missingRouteColumns || missingOperatorColumns || missingRentalEndDateColumn) {
          const retry = await supabase.from("bookings").insert([bookingPayload]).select().single();
          data = retry.data as Record<string, unknown> | null;
          error = retry.error;
        }
      }
    }

    if (error) {
      logError("Booking insert failed", {
        code: typeof error.code === "string" ? error.code : "unknown",
      });

      await releaseDedupeClaim();

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

    let ambassadorEmailStatus: NotificationStatus = "skipped";
    let ambassadorSmsResult: Awaited<ReturnType<typeof sendAmbassadorReferralAlertSms>> | undefined;

    if (referralCode && ambassadorId) {
      try {
        await supabase.from("referrals").insert([
          {
            ambassador_id: ambassadorId,
            booking_id: bookingId,
            customer_name: name,
            customer_phone: phone,
            route: destination,
            route_id: resolvedRouteId,
            university_id: resolvedUniversityId ?? ambassadorUniversityId,
            travel_date: travelDate,
            commission_amount: commissionAmount,
            commission_status: "pending",
          },
        ]);
      } catch (referralError) {
        logWarn("Referral record creation failed", { error: referralError instanceof Error ? referralError.message : String(referralError) });
      }

      // Best-effort, same as every other notification in this route — never
      // blocks the booking response if the ambassador has no email/phone on
      // file or a provider call fails.
      if (ambassadorEmail) {
        try {
          const result = await sendAmbassadorReferralEmail({
            to: ambassadorEmail,
            ambassadorName: ambassadorName || "there",
            customerName: name,
            destination,
            travelDate,
            commissionAmount,
            bookingId,
          });
          ambassadorEmailStatus = result.success ? "sent" : "failed";
          if (!result.success) logError("Ambassador referral email failed", { error: result.error, bookingId });
        } catch (error) {
          logError("Ambassador referral email execution failed", {
            error: error instanceof Error ? error.message : "Unknown email error",
            bookingId,
          });
        }
      }

      try {
        ambassadorSmsResult = await sendAmbassadorReferralAlertSms({
          phone: ambassadorPhone,
          ambassadorName,
          customerName: name,
          destination,
          commissionAmount,
          bookingId,
        });
      } catch (error) {
        logError("Ambassador referral alert SMS execution failed", {
          error: error instanceof Error ? error.message : "Unknown SMS error",
          bookingId,
        });
      }
    }

    const record = normalizeBookingRecord(data ?? {});
    const responseBooking = { ...record, fare: fare ?? record.fare };
    delete (responseBooking as Record<string, unknown>).tripId;

    // Ownership transparency (Master Plan §11.2): every booking confirmation
    // names the operator that actually runs the trip, not just Hawkins as
    // the platform. Not stored on the booking row — the response is enough
    // for a one-time confirmation screen, and looking it up here (rather
    // than joining it into the insert) keeps the operator's display_name
    // free to change later without stale copies on old bookings.
    let operatorDisplayName: string | undefined;
    if (resolvedOperatorId) {
      const { data: operatorRow } = await supabase.from("operators").select("display_name").eq("id", resolvedOperatorId).maybeSingle();
      operatorDisplayName = operatorRow?.display_name ?? undefined;
    }

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

    let adminSmsResult: Awaited<ReturnType<typeof sendAdminBookingAlertSms>> | undefined;
    try {
      adminSmsResult = await sendAdminBookingAlertSms({
        bookingId,
        name,
        destination: record.destination || "an unspecified destination",
        travelDate: record.travelDate || "an unspecified date",
        seats: record.seats || 1,
      });
    } catch (error) {
      logError("Admin booking alert SMS execution failed", {
        error: error instanceof Error ? error.message : "Unknown SMS error",
      });
    }

    return NextResponse.json({
      success: true,
      booking: responseBooking,
      bookingId,
      operatorDisplayName,
      message: "Booking created",
      notifications: {
        adminEmail: adminEmailStatus,
        customerEmail: customerEmailStatus,
        sms: smsResult.outcome,
        smsProviderStatus: smsResult.status,
        adminSms: adminSmsResult?.outcome ?? "failed",
        ambassadorEmail: ambassadorEmailStatus,
        ambassadorSms: ambassadorSmsResult?.outcome ?? "skipped",
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
  return patchAdminBookings(req);
}

export async function DELETE(req: NextRequest) {
  return deleteAdminBooking(req);
}

