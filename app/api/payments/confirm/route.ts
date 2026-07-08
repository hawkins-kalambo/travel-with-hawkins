import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeBookingRecord } from "@/lib/bookingServerUtils";
import { resolveRouteFare } from "@/lib/routePricing";
import { logError } from "@/lib/logger";


function jsonError(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function getBookingId(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

export async function POST(request: NextRequest) {
  const response = NextResponse.next();
  const { authorized, error } = await requireAdminUser(request, response);

  if (!authorized) {
    return jsonError(error || "Unauthorized", 401);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const bookingId = getBookingId((body as Record<string, unknown>).bookingId);

    if (!bookingId) {
      return jsonError("bookingId is required", 400);
    }

    const { data, error: fetchError } = await supabaseAdmin
      .from("bookings")
      .select("*")
      .eq("booking_id", bookingId)
      .maybeSingle();

    if (fetchError) {
      console.error("Failed to load booking for payment confirmation", fetchError);
      return jsonError("Unable to load booking", 500);
    }

    if (!data) {
      return jsonError("Booking not found", 404);
    }

    // ================= IDEMPOTENCY CHECK =================
    const existingPaymentStatus = String((data as Record<string, unknown>).payment_status || "");
    const existingReceiptNumber = String((data as Record<string, unknown>).receipt_number || "").trim();
    if (existingPaymentStatus === "Payment Confirmed") {
      const record = normalizeBookingRecord(data as Record<string, unknown>);
      return NextResponse.json({
        success: true,
        booking: record,
        message: "Already confirmed",
      });
    }

    // ================= RECEIPT NUMBER GENERATION =================
    let receiptNumber = existingReceiptNumber;
    if (!receiptNumber) {
      const year = new Date().getFullYear();
      const prefix = `RCP-${year}-`;
      const { data: existingRows, error: receiptError } = await supabaseAdmin
        .from("bookings")
        .select("receipt_number")
        .ilike("receipt_number", `${prefix}%`);

      if (receiptError) {
        logError("Failed to fetch receipt sequence", { error: receiptError });
      } else {
        const numbers = (existingRows || [])
          .map((row) => String((row as Record<string, unknown>).receipt_number || ""))
          .filter((value) => value.startsWith(prefix))
          .map((value) => {
            const tail = value.slice(prefix.length);
            const number = Number(tail);
            return Number.isFinite(number) ? number : 0;
          });

        const next = (Math.max(0, ...numbers) + 1).toString().padStart(6, "0");
        receiptNumber = `${prefix}${next}`;
      }
    }

    const record = normalizeBookingRecord(data as Record<string, unknown>);

    const safeStoredFare = typeof record.fare === "number" && Number.isFinite(record.fare) && record.fare > 0 ? record.fare : undefined;

    // Resolve fare from settings to ensure it stays consistent with the latest configured pricing.
    // Prefer an already-stored fare if present, otherwise compute from the latest route settings.
    let fareToStore = safeStoredFare;
    try {
      if (!fareToStore) {
        const { data: settingsData } = await supabaseAdmin
          .from("settings")
          .select("routes")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const routesText = typeof settingsData?.routes === "string" ? settingsData.routes : "";
        const resolvedFare = resolveRouteFare(record.destination, routesText, 5000);
        if (Number.isFinite(resolvedFare) && resolvedFare > 0) fareToStore = resolvedFare;
      }
    } catch {
      // ignore - fare will remain whatever is already stored
    }

    const updatePayload: Record<string, unknown> = {
      payment_status: "Payment Confirmed",
      payment_confirmed_at: new Date().toISOString(),
    };

    if (fareToStore && Number.isFinite(fareToStore) && fareToStore > 0) {
      updatePayload.fare = fareToStore;
    }

    if (receiptNumber) {
      updatePayload.receipt_number = receiptNumber;
    }

    let { data: updatedBooking, error: updateError } = await supabaseAdmin
      .from("bookings")
      .update(updatePayload)
      .eq("booking_id", bookingId)
      .select()
      .single();

    if (updateError && updatePayload.fare != null) {
      const maybeError = updateError as unknown;
      const message = String(
        typeof maybeError === "object" && maybeError !== null && "message" in maybeError ? (maybeError as Record<string, unknown>).message : null ||
        typeof maybeError === "object" && maybeError !== null && "details" in maybeError ? (maybeError as Record<string, unknown>).details : null ||
        updateError
      ).toLowerCase();
      const missingFareColumn = message.includes("fare") && (message.includes("column") || message.includes("unknown") || message.includes("undefined") || message.includes("null"));
      if (missingFareColumn) {
        delete updatePayload.fare;
        const retry = await supabaseAdmin
          .from("bookings")
          .update(updatePayload)
          .eq("booking_id", bookingId)
          .select()
          .single();
        updatedBooking = retry.data as Record<string, unknown> | null;
        updateError = retry.error;
      }
    }

    if (updateError) {
      console.error("Payment confirmation update failed", updateError);
      return jsonError("Unable to confirm payment", 500);
    }

    const updatedRecord = normalizeBookingRecord((updatedBooking as Record<string, unknown>) ?? {});



    return NextResponse.json({
      success: true,
      booking: updatedRecord,
      message: "Payment confirmed",
    });
  } catch (error) {
    logError("Payment confirmation route failed", { error });
    return jsonError(error instanceof Error ? error.message : "Unknown error", 500);
  }
}