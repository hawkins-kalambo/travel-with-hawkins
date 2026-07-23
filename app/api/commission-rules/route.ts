import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function toString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  return undefined;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function normalizeRouteName(route?: string) {
  return (route || "").trim().toLowerCase();
}

function isValidCommissionType(value: unknown): value is "fixed" | "percentage" {
  return value === "fixed" || value === "percentage";
}

function isValidStatus(value: unknown): value is "active" | "inactive" {
  return value === "active" || value === "inactive";
}

async function loadCommissionRules() {
  const { data, error } = await supabaseAdmin
    .from("commission_rules")
    .select("id, route_name, commission_amount, commission_type, status, updated_at, created_at, currency");

  if (error) {
    const missingTypeColumn =
      typeof error.message === "string" &&
      error.message.includes("commission_type");

    if (missingTypeColumn) {
      const { data: fallbackData, error: fallbackError } = await supabaseAdmin
        .from("commission_rules")
        .select("id, route_name, commission_amount, status, updated_at, created_at, currency");

      if (fallbackError) throw fallbackError;
      return (fallbackData ?? []).map((rule) => ({
        ...rule,
        commission_type: "fixed",
      }));
    }

    throw error;
  }

  return data ?? [];
}

export async function GET(req: NextRequest) {
  const response = NextResponse.next();
  const { authorized, error } = await requireAdminUser(req, response);
  if (!authorized) return jsonError(error || "Unauthorized", 401);

  try {
    const rules = await loadCommissionRules();
    return NextResponse.json({ success: true, commissionRules: rules });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Unable to load commission rules", 500);
  }
}

export async function POST(req: NextRequest) {
  const response = NextResponse.next();
  const { authorized, error } = await requireAdminUser(req, response);
  if (!authorized) return jsonError(error || "Unauthorized", 401);

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const routeName = toString(body.routeName ?? body.route_name);
    const commissionAmount = toNumber(body.commissionAmount ?? body.commission_amount);
    const commissionType = toString(body.commissionType ?? body.commission_type) as string | undefined;
    const status = toString(body.status);
    const currency = toString(body.currency) ?? "MWK";

    if (!routeName) return jsonError("routeName is required", 400);
    if (typeof commissionAmount !== "number" || commissionAmount < 0) return jsonError("commissionAmount must be a non-negative number", 400);
    if (commissionType && !isValidCommissionType(commissionType)) return jsonError("commissionType must be fixed or percentage", 400);
    if (!status || !isValidStatus(status)) return jsonError("status must be active or inactive", 400);

    const normalized = normalizeRouteName(routeName);
    const existingRule = await supabaseAdmin
      .from("commission_rules")
      .select("id")
      .eq("route_name", routeName)
      .maybeSingle();

    if (existingRule.error) {
      return jsonError(existingRule.error.message || "Unable to verify existing commission rule", 500);
    }

    const payload: Record<string, unknown> = {
      route_name: routeName,
      commission_amount: commissionAmount,
      status,
      currency,
      updated_at: new Date().toISOString(),
    };

    if (isValidCommissionType(commissionType)) {
      payload.commission_type = commissionType;
    }

    let insertedRule;
    if (existingRule.data) {
      const { data: updated, error: updateError } = await supabaseAdmin
        .from("commission_rules")
        .update(payload)
        .eq("id", existingRule.data.id)
        .select()
        .single();

      if (updateError) throw updateError;
      insertedRule = updated;
    } else {
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from("commission_rules")
        .insert([payload])
        .select()
        .single();

      if (insertError) throw insertError;
      insertedRule = inserted;
    }

    return NextResponse.json({ success: true, commissionRule: insertedRule });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Unable to save commission rule", 500);
  }
}

export async function PATCH(req: NextRequest) {
  const response = NextResponse.next();
  const { authorized, error } = await requireAdminUser(req, response);
  if (!authorized) return jsonError(error || "Unauthorized", 401);

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const id = toString(body.id);
    const routeName = toString(body.routeName ?? body.route_name);
    const commissionAmount = toNumber(body.commissionAmount ?? body.commission_amount);
    const commissionType = toString(body.commissionType ?? body.commission_type) as string | undefined;
    const status = toString(body.status);
    const currency = toString(body.currency);

    if (!id && !routeName) return jsonError("id or routeName is required", 400);
    if (commissionAmount !== undefined && (typeof commissionAmount !== "number" || commissionAmount < 0)) {
      return jsonError("commissionAmount must be a non-negative number", 400);
    }
    if (commissionType && !isValidCommissionType(commissionType)) return jsonError("commissionType must be fixed or percentage", 400);
    if (status && !isValidStatus(status)) return jsonError("status must be active or inactive", 400);

    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (routeName) payload.route_name = routeName;
    if (commissionAmount !== undefined) payload.commission_amount = commissionAmount;
    if (isValidCommissionType(commissionType)) payload.commission_type = commissionType;
    if (status) payload.status = status;
    if (currency) payload.currency = currency;

    if (Object.keys(payload).length === 1) {
      return jsonError("No valid fields provided to update", 400);
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("commission_rules")
      .update(payload)
      .eq(id ? "id" : "route_name", id || routeName || "")
      .select()
      .single();
    
    if (updateError) throw updateError;

    return NextResponse.json({ success: true, commissionRule: updated });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Unable to update commission rule", 500);
  }
}
