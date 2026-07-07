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

function isPositiveNumber(value: unknown): boolean {
  const parsed = toNumber(value);
  return typeof parsed === "number" && parsed > 0;
}

function toStringValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  return undefined;
}

export async function GET(request: NextRequest) {
  const response = NextResponse.next();
  const { authorized, error } = await requireAdminUser(request, response);

  if (!authorized) {
    return jsonError(error || "Unauthorized", 401);
  }

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
        routes: "Mzuzu - Lilongwe: 5000\nMzuzu - Blantyre: 8000\nMzuzu - Zomba: 7000\nMzuzu - Kasunga: 3000\nMzuzu - Karonga: 6000",
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

    return NextResponse.json({ success: true, settings: data, message: "Settings loaded" });
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
  const { authorized, error } = await requireAdminUser(req, response);

  if (!authorized) {
    return jsonError(error || "Unauthorized", 401);
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;

    const bookingFee = toNumber(body.bookingFee ?? body.booking_fee);
    const maxSeats = toNumber(body.maxSeats ?? body.max_seats);
    const routes = toStringValue(body.routes);

    if (!isPositiveNumber(bookingFee) || !isPositiveNumber(maxSeats) || !routes) {
      return jsonError("bookingFee and maxSeats must be positive numbers, and routes is required", 400);
    }

    const { data: existing, error: selectError } = await supabaseAdmin
      .from("settings")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (selectError) throw selectError;

    const payload = {
      booking_fee: bookingFee,
      max_seats: maxSeats,
      routes,
      updated_at: new Date().toISOString(),
    };

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
