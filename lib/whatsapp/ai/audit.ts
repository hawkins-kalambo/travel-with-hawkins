import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { logWarn } from "@/lib/logger";
import type { AiAssistantIntent, AiLanguage, AiUrgency, ControllerEntities } from "@/lib/whatsapp/ai/schema";

// One audit row per AI-assisted turn (§17). Redaction is the caller's job for
// free-text, but this function also caps lengths and never persists a secret,
// a raw provider payload, or another customer's data. Fail-soft: a logging
// problem (including the table not existing yet) must never break a reply.

const MAX_MESSAGE = 500;
const MAX_PREVIEW = 500;

export type AiInteractionRecord = {
  conversationId?: string | null;
  contactId?: string | null;
  inboundMessageId?: string | null;
  customerMessage?: string | null;
  detectedLanguage?: AiLanguage | null;
  detectedIntent?: AiAssistantIntent | string | null;
  confidence?: number | null;
  entities?: ControllerEntities | null;
  requestedTool?: string | null;
  allowedTool?: string | null;
  toolOutcome?: "none" | "ok" | "denied" | "error";
  fallbackUsed?: boolean;
  clarificationRequested?: boolean;
  humanRequested?: boolean;
  urgency?: AiUrgency;
  responsePreview?: string | null;
  responseMs?: number | null;
  model?: string | null;
};

function trim(value: string | null | undefined, max: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\x00-\x1f]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, max) : null;
}

export async function recordAiInteraction(record: AiInteractionRecord): Promise<string | null> {
  try {
    const row = {
      conversation_id: record.conversationId ?? null,
      contact_id: record.contactId ?? null,
      inbound_message_id: trim(record.inboundMessageId, 128),
      customer_message: trim(record.customerMessage, MAX_MESSAGE),
      detected_language: record.detectedLanguage ?? null,
      detected_intent: trim(String(record.detectedIntent ?? ""), 40),
      confidence: typeof record.confidence === "number" && Number.isFinite(record.confidence)
        ? Math.min(1, Math.max(0, Number(record.confidence.toFixed(3)))) : null,
      entities: record.entities && typeof record.entities === "object" ? record.entities : {},
      requested_tool: trim(record.requestedTool, 48),
      allowed_tool: trim(record.allowedTool, 48),
      tool_outcome: record.toolOutcome ?? "none",
      fallback_used: record.fallbackUsed === true,
      clarification_requested: record.clarificationRequested === true,
      human_requested: record.humanRequested === true,
      urgency: record.urgency ?? "normal",
      response_preview: trim(record.responsePreview, MAX_PREVIEW),
      response_ms: typeof record.responseMs === "number" && record.responseMs >= 0
        ? Math.round(record.responseMs) : null,
      model: trim(record.model, 80),
    };
    const result = await supabaseAdmin.from("whatsapp_ai_interactions").insert(row).select("id").maybeSingle();
    if (result.error) {
      logWarn("AI interaction audit insert failed", { code: result.error.code || "unknown" });
      return null;
    }
    return result.data ? String(result.data.id) : null;
  } catch (error) {
    logWarn("AI interaction audit threw", {
      reason: error instanceof Error ? error.message.slice(0, 120) : "unknown",
    });
    return null;
  }
}

// The customer's Helpful / Still-need-help signal, or an admin review verdict.
export async function setInteractionFeedback(
  id: string | null | undefined,
  feedback: "helpful" | "needs_help",
): Promise<void> {
  if (!id) return;
  try {
    const result = await supabaseAdmin.from("whatsapp_ai_interactions")
      .update({ feedback }).eq("id", id);
    if (result.error) logWarn("AI feedback update failed", { code: result.error.code || "unknown" });
  } catch {
    /* swallow — a feedback tag is never worth breaking a reply */
  }
}
