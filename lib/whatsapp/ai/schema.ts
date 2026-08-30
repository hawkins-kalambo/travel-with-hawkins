// The strictly-validated structure the AI controller must produce for each
// turn (Stage 1). Master plan §7. Model output is NEVER trusted directly:
// `parseControllerOutput` coerces whatever comes back into this shape or a
// safe default, and callers act only on the coerced value.

export const CONTROLLER_SCHEMA_VERSION = 1;

// Approved intents (§7). The model may not introduce new values at runtime;
// anything unrecognised collapses to "unknown".
export const AI_ASSISTANT_INTENTS = [
  "greeting", "menu",
  "route_search", "popular_routes", "university_search",
  "schedule_question", "pickup_question", "fare_question",
  "start_booking", "continue_booking",
  "my_bookings", "booking_details", "booking_deadline",
  "payment_status", "payment_help", "receipt_request",
  "cancellation_information", "change_request",
  "luggage_question",
  "support_request", "urgent_support",
  "feedback", "language_change", "restart",
  "unrelated", "unknown",
] as const;
export type AiAssistantIntent = (typeof AI_ASSISTANT_INTENTS)[number];

export const AI_LANGUAGES = ["en", "ny", "unknown"] as const;
export type AiLanguage = (typeof AI_LANGUAGES)[number];

export const AI_URGENCY = ["normal", "high", "urgent"] as const;
export type AiUrgency = (typeof AI_URGENCY)[number];

// A conservative cap on how much structured detail we keep from one turn.
const MAX_ENTITIES = 8;
const MAX_ENTITY_VALUE = 80;
const MAX_MISSING_FIELDS = 8;
const MAX_FIELD_NAME = 40;

export type ControllerEntities = {
  origin?: string;
  destination?: string;
  university?: string;
  travelDate?: string;   // YYYY-MM-DD only; anything else is dropped
  bookingId?: string;
  passengerName?: string;
  travellerType?: "student" | "general";
  direction?: "to_university" | "from_university";
};

export type ControllerOutput = {
  schemaVersion: number;
  language: AiLanguage;
  intent: AiAssistantIntent;
  confidence: number;              // 0..1
  entities: ControllerEntities;
  missingFields: string[];
  requestedTool: string | null;    // a name only — the server decides if it runs
  requiresConfirmation: boolean;
  requiresHuman: boolean;
  urgency: AiUrgency;
};

export const SAFE_CONTROLLER_OUTPUT: ControllerOutput = {
  schemaVersion: CONTROLLER_SCHEMA_VERSION,
  language: "unknown",
  intent: "unknown",
  confidence: 0,
  entities: {},
  missingFields: [],
  requestedTool: null,
  requiresConfirmation: false,
  requiresHuman: false,
  urgency: "normal",
};

function cleanStr(value: unknown, max: number): string {
  return typeof value === "string"
    ? value.replace(/[\x00-\x1f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max)
    : "";
}

function clamp01(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function coerceEntities(raw: unknown): ControllerEntities {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: ControllerEntities = {};
  let kept = 0;
  const put = (key: keyof ControllerEntities, value: string) => {
    if (value && kept < MAX_ENTITIES) { (out as Record<string, string>)[key] = value; kept += 1; }
  };
  put("origin", cleanStr(obj.origin, MAX_ENTITY_VALUE));
  put("destination", cleanStr(obj.destination, MAX_ENTITY_VALUE));
  put("university", cleanStr(obj.university, MAX_ENTITY_VALUE));
  const date = cleanStr(obj.travelDate ?? obj.travel_date, 12);
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) put("travelDate", date);
  put("bookingId", cleanStr(obj.bookingId ?? obj.booking_id, MAX_ENTITY_VALUE));
  put("passengerName", cleanStr(obj.passengerName ?? obj.passenger_name, MAX_ENTITY_VALUE));
  const traveller = cleanStr(obj.travellerType ?? obj.traveller_type, 20).toLowerCase();
  if (traveller === "student" || traveller === "general") out.travellerType = traveller;
  const direction = cleanStr(obj.direction, 20).toLowerCase();
  if (direction === "to_university" || direction === "from_university") out.direction = direction;
  return out;
}

// Turn arbitrary parsed JSON (or anything) into a valid ControllerOutput.
// Never throws.
export function parseControllerOutput(raw: unknown): ControllerOutput {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const intentRaw = cleanStr(obj.intent, MAX_FIELD_NAME).toLowerCase();
  const intent = (AI_ASSISTANT_INTENTS as readonly string[]).includes(intentRaw)
    ? (intentRaw as AiAssistantIntent) : "unknown";

  const langRaw = cleanStr(obj.language, 8).toLowerCase();
  const language = (AI_LANGUAGES as readonly string[]).includes(langRaw)
    ? (langRaw as AiLanguage) : "unknown";

  const urgRaw = cleanStr(obj.urgency, 12).toLowerCase();
  const urgency = (AI_URGENCY as readonly string[]).includes(urgRaw)
    ? (urgRaw as AiUrgency) : "normal";

  const missingFields = Array.isArray(obj.missingFields ?? obj.missing_fields)
    ? ((obj.missingFields ?? obj.missing_fields) as unknown[])
        .map((f) => cleanStr(f, MAX_FIELD_NAME)).filter(Boolean).slice(0, MAX_MISSING_FIELDS)
    : [];

  const requestedToolRaw = cleanStr(obj.requestedTool ?? obj.requested_tool, MAX_FIELD_NAME);
  // A tool name is a plain identifier — reject anything with spaces / punctuation
  // (a defence against the model returning a URL or an expression).
  const requestedTool = /^[a-zA-Z][a-zA-Z0-9_]{1,48}$/.test(requestedToolRaw) ? requestedToolRaw : null;

  const confidence = clamp01(obj.confidence);

  return {
    schemaVersion: CONTROLLER_SCHEMA_VERSION,
    language,
    intent,
    confidence,
    entities: coerceEntities(obj.entities),
    missingFields,
    // Low confidence or an unknown intent is not something to act on.
    requestedTool: intent === "unknown" || confidence < 0.35 ? null : requestedTool,
    requiresConfirmation: obj.requiresConfirmation === true || obj.requires_confirmation === true,
    requiresHuman: obj.requiresHuman === true || obj.requires_human === true || urgency === "urgent",
    urgency,
  };
}
