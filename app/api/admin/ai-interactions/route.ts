import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { logError } from "@/lib/logger";
import { requireUniversityOperationsUser } from "@/lib/universityAdminAuth";
import { jsonError } from "@/lib/apiResponse";
import { aiQualitySummary } from "@/lib/whatsapp/ai/metrics";
import { aiFeatureSnapshot } from "@/lib/whatsapp/ai/flags";

// Admin visibility into AI performance and failed answers (§17 / §30). Read +
// a review PATCH only — global operations admin. The AI cannot reach this.

const SELECT =
  "id, conversation_id, contact_id, customer_message, detected_language, detected_intent, confidence, entities, requested_tool, allowed_tool, tool_outcome, fallback_used, clarification_requested, human_requested, urgency, response_preview, response_ms, model, feedback, reviewed_by, reviewed_at, created_at";

const REVIEW = ["correct", "needs_improvement", "unsafe"] as const;

export async function GET(req: NextRequest) {
  const response = NextResponse.next();
  const access = await requireUniversityOperationsUser(req, response, "manageRoutes");
  if (!access.authorized) return jsonError(access.error, access.status);
  if (!access.isGlobal) return jsonError("AI activity is visible to a global operations admin", 403);

  try {
    const url = new URL(req.url);
    if (url.searchParams.get("summary") === "1") {
      const days = Number(url.searchParams.get("days")) || 30;
      return NextResponse.json({
        success: true,
        summary: await aiQualitySummary(days),
        features: aiFeatureSnapshot(),
      });
    }

    let query = supabaseAdmin.from("whatsapp_ai_interactions").select(SELECT)
      .order("created_at", { ascending: false }).limit(200);
    const intent = url.searchParams.get("intent");
    if (intent) query = query.eq("detected_intent", intent);
    if (url.searchParams.get("fallback") === "1") query = query.eq("fallback_used", true);
    if (url.searchParams.get("unreviewed") === "1") query = query.is("feedback", null);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ success: true, interactions: data ?? [] });
  } catch (error) {
    logError("Failed to load AI interactions", { error });
    return jsonError(error instanceof Error ? error.message : "Failed to load AI interactions");
  }
}

export async function PATCH(req: NextRequest) {
  const response = NextResponse.next();
  const access = await requireUniversityOperationsUser(req, response, "manageRoutes");
  if (!access.authorized) return jsonError(access.error, access.status);
  if (!access.isGlobal) return jsonError("AI activity is visible to a global operations admin", 403);

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const feedback = body.feedback;
    if (!id) return jsonError("id is required", 400);
    if (!REVIEW.includes(feedback as never)) {
      return jsonError("feedback must be correct, needs_improvement or unsafe", 400);
    }
    const { data, error } = await supabaseAdmin.from("whatsapp_ai_interactions")
      .update({ feedback, reviewed_by: access.user.id, reviewed_at: new Date().toISOString() })
      .eq("id", id).select(SELECT).maybeSingle();
    if (error) throw error;
    if (!data) return jsonError("Interaction not found", 404);
    return NextResponse.json({ success: true, interaction: data });
  } catch (error) {
    logError("Failed to review AI interaction", { error });
    return jsonError(error instanceof Error ? error.message : "Unable to review AI interaction");
  }
}
