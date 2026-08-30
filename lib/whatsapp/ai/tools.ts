import "server-only";

// The AI tool registry (Stage 1). Master plan §6. The model may *name* a tool;
// only `runTool` decides whether it runs, after checking: the tool exists, the
// kill switch is off, the feature flag is on, the sender is authorised for the
// tool's scope, a confirmation token is present when required, and the input
// passes a strict schema. Results are the minimum customer-safe shape — never a
// secret, never a raw provider payload, never another customer's data.

import { isAiFeatureEnabled } from "@/lib/whatsapp/ai/flags";
import { getToolPermission } from "@/lib/whatsapp/ai/permissions";
import { searchKnowledge } from "@/lib/whatsapp/ai/knowledgeStore";
import {
  findDepartureForRouteDate, listActiveUniversities, listBookableRoutes,
  listPopularRoutes, listWhatsAppBookings, loadBookableRoute, loadWhatsAppBooking,
  matchActiveUniversity, type BookableRoute,
} from "@/lib/whatsapp/domain";

export type ToolContext = {
  // The verified WhatsApp contact id (from the authenticated webhook sender),
  // or null when the sender is not linked to a contact. Customer- and
  // write-scoped tools require a non-null value.
  contactId: string | null;
  waId: string;
  // Issued by the server for the final step of a write flow — never by the model.
  confirmationToken?: string | null;
};

export type ToolErrorCode =
  | "unknown_tool" | "feature_disabled" | "not_authorized"
  | "confirmation_required" | "invalid_input" | "not_found" | "tool_error";

export type ToolResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: ToolErrorCode; message: string };

type Validated<T> = { ok: true; value: T } | { ok: false; message: string };
type ToolDef = {
  validate(input: unknown): Validated<Record<string, unknown>>;
  run(ctx: ToolContext, input: Record<string, unknown>): Promise<ToolResult>;
};

// --- tiny input helpers (no external schema lib in this project) ------------
function asObject(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" ? (input as Record<string, unknown>) : {};
}
function reqStr(obj: Record<string, unknown>, key: string, max = 80): string | null {
  const v = obj[key];
  if (typeof v !== "string") return null;
  const s = v.replace(/[\x00-\x1f]+/g, " ").trim().slice(0, max);
  return s || null;
}
const noInput: ToolDef["validate"] = () => ({ ok: true, value: {} });

function routeView(r: BookableRoute) {
  return {
    routeId: r.routeId, label: r.label, origin: r.origin, destination: r.destination,
    pickup: r.pickup, fare: r.priced ? r.fare : null, priced: r.priced,
    routeType: r.routeType, universityShortCode: r.universityShortCode,
  };
}

// --------------------------------------------------------------------------
const REGISTRY: Record<string, ToolDef> = {
  searchActiveRoutes: {
    validate(input) {
      const o = asObject(input);
      const origin = reqStr(o, "origin");
      return origin ? { ok: true, value: { origin, destination: reqStr(o, "destination") ?? "" } }
        : { ok: false, message: "origin is required" };
    },
    async run(_ctx, input) {
      const rows = await listBookableRoutes(String(input.origin));
      const dest = String(input.destination || "").toLowerCase();
      const filtered = dest
        ? rows.filter((r) => `${r.destination} ${r.label}`.toLowerCase().includes(dest))
        : rows;
      return { ok: true, data: filtered.slice(0, 10).map(routeView) };
    },
  },
  listPopularRoutes: {
    validate: noInput,
    async run() { return { ok: true, data: (await listPopularRoutes()).map(routeView) }; },
  },
  getRouteDetails: {
    validate(input) {
      const routeId = reqStr(asObject(input), "routeId");
      return routeId ? { ok: true, value: { routeId } } : { ok: false, message: "routeId is required" };
    },
    async run(_ctx, input) {
      const r = await loadBookableRoute(String(input.routeId));
      return r ? { ok: true, data: routeView(r) } : { ok: false, error: "not_found", message: "route not found" };
    },
  },
  listActiveUniversities: {
    validate: noInput,
    async run() { return { ok: true, data: await listActiveUniversities() }; },
  },
  resolveUniversity: {
    validate(input) {
      const q = reqStr(asObject(input), "input");
      return q ? { ok: true, value: { input: q } } : { ok: false, message: "input is required" };
    },
    async run(_ctx, input) {
      const match = matchActiveUniversity(String(input.input), await listActiveUniversities());
      return match ? { ok: true, data: match } : { ok: false, error: "not_found", message: "no active university matched" };
    },
  },
  getPickupPoints: {
    validate(input) {
      const routeId = reqStr(asObject(input), "routeId");
      return routeId ? { ok: true, value: { routeId } } : { ok: false, message: "routeId is required" };
    },
    async run(_ctx, input) {
      const r = await loadBookableRoute(String(input.routeId));
      return r ? { ok: true, data: { pickup: r.pickup } } : { ok: false, error: "not_found", message: "route not found" };
    },
  },
  findScheduledTrips: {
    validate(input) {
      const o = asObject(input);
      const routeId = reqStr(o, "routeId");
      const date = reqStr(o, "travelDate", 12);
      if (!routeId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return { ok: false, message: "routeId and travelDate (YYYY-MM-DD) are required" };
      }
      return { ok: true, value: { routeId, travelDate: date } };
    },
    async run(_ctx, input) {
      const dep = await findDepartureForRouteDate(String(input.routeId), String(input.travelDate));
      return {
        ok: true,
        data: dep ? [{ travelDate: dep.travelDate, departureTime: dep.departureTime ?? null, pickup: dep.pickup, availableSeats: dep.availableSeats }] : [],
      };
    },
  },
  getPublicFare: {
    validate(input) {
      const routeId = reqStr(asObject(input), "routeId");
      return routeId ? { ok: true, value: { routeId } } : { ok: false, message: "routeId is required" };
    },
    async run(_ctx, input) {
      const r = await loadBookableRoute(String(input.routeId));
      return r ? { ok: true, data: { fare: r.priced ? r.fare : null, priced: r.priced } }
        : { ok: false, error: "not_found", message: "route not found" };
    },
  },
  searchApprovedKnowledge: {
    validate(input) {
      const o = asObject(input);
      const q = reqStr(o, "question", 400);
      if (!q) return { ok: false, message: "question is required" };
      const lang = reqStr(o, "language", 4) === "ny" ? "ny" : "en";
      return { ok: true, value: { question: q, language: lang } };
    },
    async run(_ctx, input) {
      return { ok: true, data: await searchKnowledge(String(input.question), input.language === "ny" ? "ny" : "en") };
    },
  },

  // --- customer-scoped (contactId is guaranteed non-null by runTool) ---
  getCustomerBookings: {
    validate: noInput,
    async run(ctx) { return { ok: true, data: await listWhatsAppBookings(ctx.contactId as string) }; },
  },
  getCustomerBooking: {
    validate(input) {
      const bookingId = reqStr(asObject(input), "bookingId");
      return bookingId ? { ok: true, value: { bookingId } } : { ok: false, message: "bookingId is required" };
    },
    async run(ctx, input) {
      const b = await loadWhatsAppBooking(String(input.bookingId), ctx.contactId as string);
      return b ? { ok: true, data: b } : { ok: false, error: "not_found", message: "booking not found on this number" };
    },
  },
  getCustomerPaymentStatus: {
    validate(input) {
      const bookingId = reqStr(asObject(input), "bookingId");
      return bookingId ? { ok: true, value: { bookingId } } : { ok: false, message: "bookingId is required" };
    },
    async run(ctx, input) {
      const b = await loadWhatsAppBooking(String(input.bookingId), ctx.contactId as string);
      return b
        ? { ok: true, data: { status: b.status, bookingFeeStatus: b.bookingFeeStatus, fareStatus: b.fareStatus } }
        : { ok: false, error: "not_found", message: "booking not found on this number" };
    },
  },
  calculateBookingFeeDeadline: {
    validate(input) {
      const bookingId = reqStr(asObject(input), "bookingId");
      return bookingId ? { ok: true, value: { bookingId } } : { ok: false, message: "bookingId is required" };
    },
    async run(ctx, input) {
      const b = await loadWhatsAppBooking(String(input.bookingId), ctx.contactId as string);
      return b
        ? { ok: true, data: { deadline: b.expiresAt, bookingFeeStatus: b.bookingFeeStatus } }
        : { ok: false, error: "not_found", message: "booking not found on this number" };
    },
  },

  // --- Stage 1 stubs: declared + permission-gated, wired in later stages ---
  getCustomerReceipt: { validate: noInput, async run() { return { ok: false, error: "tool_error", message: "not available yet" }; } },
  getConversationContext: { validate: noInput, async run() { return { ok: false, error: "tool_error", message: "not available yet" }; } },
  createBookingDraft: { validate: noInput, async run() { return { ok: false, error: "feature_disabled", message: "booking drafts land in Stage 4" }; } },
  updateBookingDraft: { validate: noInput, async run() { return { ok: false, error: "feature_disabled", message: "booking drafts land in Stage 4" }; } },
  confirmBookingDraft: { validate: noInput, async run() { return { ok: false, error: "feature_disabled", message: "booking drafts land in Stage 4" }; } },
  createRouteRequest: { validate: noInput, async run() { return { ok: false, error: "feature_disabled", message: "wired in Stage 3" }; } },
  requestHumanAgent: { validate: noInput, async run() { return { ok: false, error: "feature_disabled", message: "wired in Stage 5" }; } },
  submitAssistantFeedback: { validate: noInput, async run() { return { ok: false, error: "feature_disabled", message: "wired in Stage 6" }; } },
};

export function listRegisteredTools(): string[] {
  return Object.keys(REGISTRY);
}

export async function runTool(
  name: string, ctx: ToolContext, input: unknown, opts: { env?: NodeJS.ProcessEnv } = {},
): Promise<ToolResult> {
  const perm = getToolPermission(name);
  const def = REGISTRY[name];
  if (!perm || !def) return { ok: false, error: "unknown_tool", message: `no such tool: ${name}` };

  if (!isAiFeatureEnabled("assistant", opts.env)) {
    return { ok: false, error: "feature_disabled", message: "the assistant is disabled" };
  }
  if (perm.feature && !isAiFeatureEnabled(perm.feature, opts.env)) {
    return { ok: false, error: "feature_disabled", message: `feature "${perm.feature}" is disabled` };
  }
  if ((perm.scope === "customer" || perm.scope === "write") && !ctx.contactId) {
    return { ok: false, error: "not_authorized", message: "a verified WhatsApp sender is required" };
  }
  if (perm.requiresConfirmationToken && !ctx.confirmationToken) {
    return { ok: false, error: "confirmation_required", message: "a server confirmation token is required" };
  }

  const validated = def.validate(input);
  if (!validated.ok) return { ok: false, error: "invalid_input", message: validated.message };

  try {
    return await def.run(ctx, validated.value);
  } catch (error) {
    return {
      ok: false, error: "tool_error",
      message: error instanceof Error ? error.message.slice(0, 120) : "tool failed",
    };
  }
}
