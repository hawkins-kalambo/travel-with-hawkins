import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  canRescheduleJourney,
  canTransitionJourneyStatus,
  parseFutureTravelDate,
  parseJourneyStatus,
} from "@/lib/bookingLifecycle";
import { buildCommissionReversalUpdate } from "@/lib/commissionLifecycle";
import { sendBookingJourneyUpdateSms } from "@/lib/africasTalking";
import { createCommunicationNotification } from "@/lib/communicationEngine";
import { sendEmail } from "@/lib/resend";
import { resolveRouteFareIfAvailable } from "@/lib/routePricing";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateTripId, normalizeBookingRecord } from "@/lib/bookingServerUtils";
import {
  requireUniversityOperationsUser,
} from "@/lib/universityAdminAuth";

function jsonError(message: string, status = 500, details?: unknown) {
  return NextResponse.json({ success: false, error: message, ...(details ? { details } : {}) }, { status });
}

function getIdentifier(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

async function writeBookingAudit(args: {
  request: NextRequest;
  actorUserId: string;
  actorRole: string;
  action: string;
  entityId: string;
  previousValue: unknown;
  newValue: unknown;
  metadata?: Record<string, unknown>;
  universityId?: string;
}) {
  const { error } = await supabaseAdmin.from("audit_logs").insert({
    actor_user_id: args.actorUserId,
    actor_role: args.actorRole,
    action: args.action,
    entity_type: "booking",
    entity_id: args.entityId,
    previous_value: args.previousValue,
    new_value: args.newValue,
    ip_address: args.request.headers.get("x-real-ip"),
    user_agent: args.request.headers.get("user-agent"),
    metadata: args.metadata ?? {},
    university_id: args.universityId ?? null,
  });

  // Auditing must not turn a successful operational update into a false
  // failure, but it must remain visible in server logs for investigation.
  if (error) console.error("Failed to write booking audit log", error);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] ?? character);
}

async function notifyCustomerOfJourneyChange(args: {
  previous: Record<string, unknown>;
  updated: ReturnType<typeof normalizeBookingRecord>;
  cancellationReason?: string;
  previousTravelDate?: string;
}) {
  const bookingId = args.updated.bookingId ?? "booking";
  const customerId = typeof args.previous.customer_id === "string" ? args.previous.customer_id : "";
  const email = typeof args.updated.email === "string" ? args.updated.email.trim() : "";
  const phone = typeof args.updated.phone === "string" ? args.updated.phone.trim() : "";
  const cancelled = args.updated.status === "Cancelled";
  const title = cancelled ? "Booking Cancelled" : "Booking Rescheduled";
  const message = cancelled
    ? `Booking ${bookingId} has been cancelled. Reason: ${args.cancellationReason}.`
    : `Booking ${bookingId} has moved from ${args.previousTravelDate || "the previous date"} to ${args.updated.travelDate}.`;

  const tasks: Promise<unknown>[] = [];
  if (customerId) {
    tasks.push(createCommunicationNotification({
      profile_id: customerId,
      type: cancelled ? "booking_cancelled" : "booking_rescheduled",
      title,
      message,
      priority: "high",
      related_type: "bookings",
      related_id: bookingId,
      metadata: {
        booking_id: bookingId,
        cancellation_reason: args.cancellationReason,
        previous_travel_date: args.previousTravelDate,
        travel_date: args.updated.travelDate,
      },
    }));
  }

  if (email && email.includes("@")) {
    tasks.push(sendEmail({
      to: email,
      subject: `${title} - Travel with Hawkins`,
      html: `
        <div style="font-family:Arial,sans-serif;padding:20px;line-height:1.6">
          <h2 style="color:#0f3f78">${title}</h2>
          <p>Hello <b>${escapeHtml(args.updated.name || "Customer")}</b>,</p>
          <p>${escapeHtml(message)}</p>
          <p><b>Destination:</b> ${escapeHtml(args.updated.destination || "—")}</p>
          <p><b>Travel date:</b> ${escapeHtml(args.updated.travelDate || "—")}</p>
          <p>If you need help, reply to this email or contact Travel with Hawkins support.</p>
        </div>
      `,
    }));
  }

  if (phone) {
    tasks.push(sendBookingJourneyUpdateSms({
      bookingId,
      phone,
      change: cancelled ? "cancelled" : "rescheduled",
      travelDate: args.updated.travelDate,
      cancellationReason: args.cancellationReason,
    }));
  }

  await Promise.allSettled(tasks);
}

export async function GET(request: NextRequest) {
  const response = NextResponse.next();
  const auth = await requireUniversityOperationsUser(request, response, "viewBookings");
  if (!auth.authorized) return jsonError(auth.error, auth.status);

  try {
    const auditBookingId = new URL(request.url).searchParams.get("auditBookingId")?.trim();
    if (auditBookingId) {
      let bookingScopeQuery = supabaseAdmin
        .from("bookings")
        .select("booking_id")
        .eq("booking_id", auditBookingId);
      if (!auth.isGlobal) bookingScopeQuery = bookingScopeQuery.in("university_id", auth.universityIds);
      const { data: scopedBooking, error: scopedBookingError } = await bookingScopeQuery.maybeSingle();
      if (scopedBookingError) return jsonError("Unable to verify booking access", 500);
      if (!scopedBooking) return jsonError("Booking not found", 404);

      const { data: history, error: historyError } = await supabaseAdmin
        .from("audit_logs")
        .select("id, actor_role, action, previous_value, new_value, metadata, created_at")
        .eq("entity_type", "booking")
        .eq("entity_id", auditBookingId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (historyError) return jsonError("Unable to load booking history", 500);
      return NextResponse.json({ success: true, history: history ?? [] });
    }

    let bookingsQuery = supabaseAdmin
      .from("bookings")
      .select("*")
      .order("created_at", { ascending: false });
    if (!auth.isGlobal) bookingsQuery = bookingsQuery.in("university_id", auth.universityIds);
    const { data, error } = await bookingsQuery;

    if (error) {
      console.error("Failed to load admin bookings", error);
      return jsonError("Unable to load bookings", 500);
    }

    const { data: settings } = await supabaseAdmin
      .from("settings")
      .select("routes, route_objects")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const bookings = (data ?? []).map((row) => {
      const booking = normalizeBookingRecord(row as Record<string, unknown>);
      if (typeof booking.fare !== "number" || !Number.isFinite(booking.fare) || booking.fare <= 0) {
        booking.fare = resolveRouteFareIfAvailable(booking.destination, settings as Record<string, unknown> | undefined);
      }
      return booking;
    });

    return NextResponse.json({
      success: true,
      bookings,
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unknown error");
  }
}

export async function PATCH(request: NextRequest) {
  const response = NextResponse.next();
  const auth = await requireUniversityOperationsUser(request, response, "manageBookings");
  if (!auth.authorized) return jsonError(auth.error, auth.status);

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const bookingId = getIdentifier(body.bookingId);
    const tripId = getIdentifier(body.tripId);
    const requestedStatus = body.status === undefined ? undefined : parseJourneyStatus(body.status);
    const requestedTravelDate = body.travelDate === undefined ? undefined : parseFutureTravelDate(body.travelDate);
    const cancellationReason = typeof body.cancellationReason === "string" ? body.cancellationReason.trim() : "";
    const paymentNotes = typeof body.paymentNotes === "string" ? body.paymentNotes.trim() : undefined;

    if ((!bookingId && !tripId) || (bookingId && tripId)) {
      return jsonError("Provide exactly one of bookingId or tripId", 400);
    }
    if (body.status !== undefined && !requestedStatus) {
      return jsonError("Unsupported journey status", 400);
    }
    if (body.travelDate !== undefined && !requestedTravelDate) {
      return jsonError("Travel date must be a valid date that is not in the past", 400);
    }
    if (requestedStatus === "Cancelled" && (cancellationReason.length < 5 || cancellationReason.length > 500)) {
      return jsonError("Cancellation reason must be between 5 and 500 characters", 400);
    }
    if (requestedTravelDate && !bookingId) {
      return jsonError("Rescheduling requires a single bookingId", 400);
    }
    if (!requestedStatus && !requestedTravelDate && paymentNotes === undefined) {
      return jsonError("No supported update fields provided", 400);
    }

    let lookup = supabaseAdmin.from("bookings").select("*");
    lookup = bookingId ? lookup.eq("booking_id", bookingId) : lookup.eq("trip_id", tripId!);
    if (!auth.isGlobal) lookup = lookup.in("university_id", auth.universityIds);
    const { data: existingRows, error: lookupError } = await lookup;

    if (lookupError) {
      console.error("Failed to load booking before admin update", lookupError);
      return jsonError("Unable to load booking", 500);
    }
    if (!existingRows?.length) return jsonError(bookingId ? "Booking not found" : "Trip not found", 404);

    if (requestedStatus) {
      const invalidRows = existingRows
        .map((row) => normalizeBookingRecord(row as Record<string, unknown>))
        .filter((booking) => !canTransitionJourneyStatus(booking.status, requestedStatus))
        .map((booking) => ({ bookingId: booking.bookingId, currentStatus: booking.status }));

      if (invalidRows.length) {
        return jsonError(`Cannot move every selected booking to ${requestedStatus}`, 409, invalidRows);
      }
    }

    const existingBookings = existingRows.map((row) => normalizeBookingRecord(row as Record<string, unknown>));
    if (requestedTravelDate && !canRescheduleJourney(existingBookings[0]?.status)) {
      return jsonError("Only booked or confirmed journeys can be rescheduled", 409);
    }

    const updatePayload: Record<string, unknown> = {};
    if (requestedStatus) updatePayload.status = requestedStatus;
    if (paymentNotes !== undefined) updatePayload.payment_notes = paymentNotes;
    if (requestedTravelDate) {
      updatePayload.travel_date = requestedTravelDate;
      updatePayload.trip_id = generateTripId(existingBookings[0]?.destination, requestedTravelDate);
    }

    let update = supabaseAdmin.from("bookings").update(updatePayload);
    update = bookingId ? update.eq("booking_id", bookingId) : update.eq("trip_id", tripId!);
    if (!auth.isGlobal) update = update.in("university_id", auth.universityIds);
    const { data: updatedRows, error: updateError } = await update.select();

    if (updateError) {
      console.error("Admin booking update failed", updateError);
      return jsonError("Unable to update booking", 500);
    }

    const normalizedRows = (updatedRows ?? []).map((row) => normalizeBookingRecord(row as Record<string, unknown>));
    let commissionReversal: { reversed: number; needsManualReview: string[] } | undefined;

    if (requestedStatus === "Cancelled") {
      const bookingIds = normalizedRows.map((row) => row.bookingId).filter((id): id is string => Boolean(id));
      if (bookingIds.length) {
        const reversal = await supabaseAdmin
          .from("referrals")
          .update(buildCommissionReversalUpdate(`Booking cancelled: ${cancellationReason}`))
          .in("booking_id", bookingIds)
          .in("commission_status", ["pending", "approved"])
          .select("booking_id");

        if (reversal.error) console.error("Failed to reverse commissions for cancelled bookings", reversal.error);

        const paidLookup = await supabaseAdmin
          .from("referrals")
          .select("booking_id")
          .in("booking_id", bookingIds)
          .eq("commission_status", "paid");

        if (paidLookup.error) console.error("Failed to find paid commissions requiring review", paidLookup.error);
        commissionReversal = {
          reversed: reversal.data?.length ?? 0,
          needsManualReview: (paidLookup.data ?? []).map((row) => String(row.booking_id)),
        };
      }
    }

    await Promise.all(
      normalizedRows.map((row) => {
        const previous = existingRows.find((item) => String(item.booking_id) === row.bookingId);
        return writeBookingAudit({
          request,
          actorUserId: auth.user!.id,
          actorRole: auth.role!,
          action:
            requestedStatus === "Cancelled"
              ? "cancel_booking"
              : requestedTravelDate
                ? "reschedule_booking"
                : "update_booking",
          entityId: row.bookingId ?? tripId ?? "unknown",
          previousValue: previous ?? null,
          newValue: row,
          metadata: {
            scope: bookingId ? "booking" : "trip",
            previousTripId: previous?.trip_id ?? null,
            tripId: row.tripId,
            previousTravelDate: previous?.travel_date ?? null,
            travelDate: row.travelDate,
            cancellationReason: requestedStatus === "Cancelled" ? cancellationReason : undefined,
          },
          universityId: row.universityId,
        });
      })
    );

    if (requestedStatus === "Cancelled" || requestedTravelDate) {
      await Promise.allSettled(normalizedRows.map((row) => {
        const previous = existingRows.find((item) => String(item.booking_id) === row.bookingId) as Record<string, unknown> | undefined;
        if (!previous) return Promise.resolve();
        return notifyCustomerOfJourneyChange({
          previous,
          updated: row,
          cancellationReason: requestedStatus === "Cancelled" ? cancellationReason : undefined,
          previousTravelDate: typeof previous.travel_date === "string" ? previous.travel_date : undefined,
        });
      }));
    }

    return NextResponse.json({
      success: true,
      booking: bookingId ? normalizedRows[0] : undefined,
      bookings: normalizedRows,
      updatedCount: normalizedRows.length,
      commissionReversal,
      message: bookingId ? "Booking updated" : `${normalizedRows.length} trip bookings updated`,
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unknown error");
  }
}

export async function DELETE() {
  return jsonError("Bookings cannot be permanently deleted. Cancel the booking instead.", 405);
}
