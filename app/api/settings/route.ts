import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { logError } from "@/lib/logger";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function toStringValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  return undefined;
}

function toBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return undefined;
}

function toJsonObject(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return undefined;
}

function toJsonArray(value: unknown): unknown[] | undefined {
  if (Array.isArray(value)) return value;
  return undefined;
}

function buildDefaultRouteObjects(routesText: string) {
  return routesText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [routePart, farePart] = line.split(":");
      const [origin = "", destination = ""] = (routePart || "").split("-").map((segment) => segment.trim());
      return {
        id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        route_name: (routePart || "").trim(),
        origin: origin.trim(),
        destination: destination.trim(),
        fare: Number((farePart || "").replace(/[^0-9.-]/g, "")) || 0,
        status: "active",
        estimated_travel_time: "",
        capacity: 0,
        updated_at: new Date().toISOString(),
      };
    });
}

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("settings")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      const defaults = {
        booking_fee: 2000,
        max_seats: 15,
        routes: "Mzuzu - Lilongwe: 5000\nMzuzu - Blantyre: 8000\nMzuzu - Zomba: 7000\nMzuzu - Kasungu: 3000\nMzuzu - Karonga: 6000",
        route_objects: buildDefaultRouteObjects(
          "Mzuzu - Lilongwe: 5000\nMzuzu - Blantyre: 8000\nMzuzu - Zomba: 7000\nMzuzu - Kasungu: 3000\nMzuzu - Karonga: 6000"
        ),
        referral_program: {
          enabled: true,
          allowReferralWithoutLogin: false,
          requireAmbassadorApproval: false,
          defaultAmbassadorStatus: "active",
          referralCodeLength: 6,
          referralCodePrefix: "ENG2026",
          maxReferralsPerStudent: null,
          minimumBookingValue: 0,
          defaultCommissionStatus: "pending",
        },
        trip_rules: {
          maxPassengersPerTrip: 15,
          bookingDeadlineHours: 24,
          cancellationDeadlineHours: 6,
          autoBookingConfirmation: false,
          autoCommissionCreation: true,
          autoCommissionApproval: false,
        },
        payment_settings: {
          currency: "MWK",
          defaultPaymentMethods: ["Airtel Money", "TNM Mpamba", "Bank Transfer", "Cash"],
          defaultPaymentStatus: "Pending",
          allowPartialPayments: false,
          generateReceiptsAutomatically: true,
        },
        notification_settings: {
          bookingConfirmationEmail: true,
          bookingConfirmationSms: false,
          ambassadorNotifications: true,
          commissionApprovalNotifications: true,
          tripReminderNotifications: true,
        },
        system_preferences: {
          companyName: "Travel with Hawkins",
          companyLogoUrl: "/logo.png",
          supportEmail: "support@travelwithhawkins.com",
          supportPhone: "+265 999 000 000",
          bookingTerms: "Booking terms and conditions apply.",
          privacyPolicy: "Your data is handled securely.",
        },
        updated_at: new Date().toISOString(),
      };

      const { data: inserted, error: insertError } = await supabaseAdmin
        .from("settings")
        .insert([defaults])
        .select()
        .single();

      if (insertError) throw insertError;

      return NextResponse.json({ success: true, settings: inserted, message: "Settings loaded" });
    }

    const normalized = {
      ...data,
      route_objects:
        data.route_objects && Array.isArray(data.route_objects)
          ? data.route_objects
          : buildDefaultRouteObjects(String(data.routes || "")),
    };

    return NextResponse.json({ success: true, settings: normalized, message: "Settings loaded" });
  } catch (error) {
    logError("Failed to load settings", { error });
    return jsonError(error instanceof Error ? error.message : "Failed to load settings");
  }
}

export async function PATCH(req: NextRequest) {
  return updateSettings(req);
}

export async function PUT(req: NextRequest) {
  return updateSettings(req);
}

async function updateSettings(req: NextRequest) {
  const response = NextResponse.next();
  const { authorized, user, error } = await requireAdminUser(req, response);

  if (!authorized) {
    return jsonError(error || "Unauthorized", 401);
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;

    const bookingFee = toNumber(body.bookingFee ?? body.booking_fee);
    const maxSeats = toNumber(body.maxSeats ?? body.max_seats);
    const routes = toStringValue(body.routes);
    const routeObjects = toJsonArray(body.routeObjects ?? body.route_objects);
    const referralProgram = toJsonObject(body.referralProgram ?? body.referral_program);
    const tripRules = toJsonObject(body.tripRules ?? body.trip_rules);
    const paymentSettings = toJsonObject(body.paymentSettings ?? body.payment_settings);
    const notificationSettings = toJsonObject(body.notificationSettings ?? body.notification_settings);
    const systemPreferences = toJsonObject(body.systemPreferences ?? body.system_preferences);

    const { data: existing, error: selectError } = await supabaseAdmin
      .from("settings")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (selectError) throw selectError;

    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (bookingFee !== undefined) payload.booking_fee = bookingFee;
    if (maxSeats !== undefined) payload.max_seats = maxSeats;
    if (routes !== undefined) payload.routes = routes;
    if (routeObjects !== undefined) payload.route_objects = routeObjects;
    if (referralProgram !== undefined) payload.referral_program = referralProgram;
    if (tripRules !== undefined) payload.trip_rules = tripRules;
    if (paymentSettings !== undefined) payload.payment_settings = paymentSettings;
    if (notificationSettings !== undefined) payload.notification_settings = notificationSettings;
    if (systemPreferences !== undefined) payload.system_preferences = systemPreferences;

    if (Object.keys(payload).length === 1) {
      return jsonError("No valid fields provided to update", 400);
    }

    let result;
    if (existing?.id) {
      const { data, error } = await supabaseAdmin
        .from("settings")
        .update(payload)
        .eq("id", existing.id)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await supabaseAdmin
        .from("settings")
        .insert([payload])
        .select()
        .single();

      if (error) throw error;
      result = data;
    }

    if (existing?.id) {
      const auditPayload = {
        admin_id: user?.id || "unknown",
        action: "update_settings",
        entity: "settings",
        old_value: existing,
        new_value: result,
      };
      await supabaseAdmin.from("audit_logs").insert([auditPayload]);
    }

    return NextResponse.json({
      success: true,
      message: "Settings updated successfully",
      settings: result,
    });
  } catch (error) {
    logError("Failed to update settings", { error });
    return jsonError(error instanceof Error ? error.message : "Failed to update settings");
  }
}
