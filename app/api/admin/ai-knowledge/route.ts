import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { logError } from "@/lib/logger";
import { requireUniversityOperationsUser } from "@/lib/universityAdminAuth";
import { jsonError } from "@/lib/apiResponse";

// Admin CRUD for the approved AI knowledge base (§16). Global operations admin
// only. Every change bumps `version` and writes an append-only history row.
// The AI can never reach this route — it has no admin session.

const SELECT =
  "id, topic, category, example_questions, approved_answer, language, keywords, is_active, priority, requires_live_data, requires_review, version, created_by, updated_by, last_reviewed_at, created_at, updated_at";

const CATEGORIES = [
  "general", "faq", "booking", "booking_fee", "payment", "cancellation", "luggage",
  "pickup", "business_info", "contact", "student_travel", "university_travel", "support",
] as const;

function str(v: unknown, max = 2000): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.replace(/[\x00-\x1f]+/g, (m) => (m.includes("\n") ? "\n" : " ")).trim();
  return t ? t.slice(0, max) : undefined;
}
function bool(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return undefined;
}
function intOrUndef(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
}

async function recordHistory(
  knowledgeId: string, version: number,
  action: "created" | "updated" | "activated" | "deactivated" | "deleted",
  snapshot: unknown, changedBy: string | null,
) {
  await supabaseAdmin.from("ai_knowledge_history").insert({
    knowledge_id: knowledgeId, version, action, snapshot: snapshot ?? {}, changed_by: changedBy,
  });
}

export async function GET(req: NextRequest) {
  const response = NextResponse.next();
  const access = await requireUniversityOperationsUser(req, response, "manageRoutes");
  if (!access.authorized) return jsonError(access.error, access.status);
  if (!access.isGlobal) return jsonError("AI knowledge is managed by a global operations admin", 403);

  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status"); // active | inactive | review
    let query = supabaseAdmin.from("ai_knowledge").select(SELECT)
      .order("priority", { ascending: true }).order("updated_at", { ascending: false }).limit(500);
    if (status === "active") query = query.eq("is_active", true);
    if (status === "inactive") query = query.eq("is_active", false);
    if (status === "review") query = query.eq("requires_review", true);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ success: true, entries: data ?? [] });
  } catch (error) {
    logError("Failed to load AI knowledge", { error });
    return jsonError(error instanceof Error ? error.message : "Failed to load AI knowledge");
  }
}

export async function POST(req: NextRequest) {
  const response = NextResponse.next();
  const access = await requireUniversityOperationsUser(req, response, "manageRoutes");
  if (!access.authorized) return jsonError(access.error, access.status);
  if (!access.isGlobal) return jsonError("AI knowledge is managed by a global operations admin", 403);

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const topic = str(body.topic, 160);
    const approvedAnswer = str(body.approvedAnswer ?? body.approved_answer);
    if (!topic) return jsonError("topic is required", 400);
    if (!approvedAnswer) return jsonError("approvedAnswer is required", 400);
    const category = CATEGORIES.includes(body.category as never) ? (body.category as string) : "general";
    const language = body.language === "ny" ? "ny" : "en";

    const row = {
      topic, approved_answer: approvedAnswer, category, language,
      example_questions: str(body.exampleQuestions ?? body.example_questions, 2000) ?? "",
      keywords: str(body.keywords, 500) ?? "",
      is_active: bool(body.isActive ?? body.is_active) ?? false,
      priority: intOrUndef(body.priority) ?? 100,
      requires_live_data: bool(body.requiresLiveData ?? body.requires_live_data) ?? false,
      // Chichewa entries and AI-suggested drafts start needing review.
      requires_review: bool(body.requiresReview ?? body.requires_review) ?? (language === "ny"),
      version: 1,
      created_by: access.user.id,
      updated_by: access.user.id,
    };
    const { data, error } = await supabaseAdmin.from("ai_knowledge").insert(row).select(SELECT).single();
    if (error) throw error;
    await recordHistory(data.id, 1, "created", data, access.user.id);
    return NextResponse.json({ success: true, entry: data });
  } catch (error) {
    logError("Failed to create AI knowledge", { error });
    return jsonError(error instanceof Error ? error.message : "Unable to create AI knowledge");
  }
}

export async function PATCH(req: NextRequest) {
  const response = NextResponse.next();
  const access = await requireUniversityOperationsUser(req, response, "manageRoutes");
  if (!access.authorized) return jsonError(access.error, access.status);
  if (!access.isGlobal) return jsonError("AI knowledge is managed by a global operations admin", 403);

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const id = str(body.id, 60);
    if (!id) return jsonError("id is required", 400);

    const { data: current, error: currentError } = await supabaseAdmin
      .from("ai_knowledge").select(SELECT).eq("id", id).maybeSingle();
    if (currentError) throw currentError;
    if (!current) return jsonError("Entry not found", 404);

    const patch: Record<string, unknown> = { updated_by: access.user.id, version: Number(current.version) + 1 };
    const topic = str(body.topic, 160);
    if (topic) patch.topic = topic;
    const answer = str(body.approvedAnswer ?? body.approved_answer);
    if (answer) patch.approved_answer = answer;
    if (CATEGORIES.includes(body.category as never)) patch.category = body.category;
    if (body.language === "en" || body.language === "ny") patch.language = body.language;
    const ex = str(body.exampleQuestions ?? body.example_questions, 2000);
    if (ex !== undefined) patch.example_questions = ex;
    const kw = str(body.keywords, 500);
    if (kw !== undefined) patch.keywords = kw;
    const pr = intOrUndef(body.priority);
    if (pr !== undefined) patch.priority = pr;
    const rld = bool(body.requiresLiveData ?? body.requires_live_data);
    if (rld !== undefined) patch.requires_live_data = rld;
    const rr = bool(body.requiresReview ?? body.requires_review);
    if (rr !== undefined) patch.requires_review = rr;
    const active = bool(body.isActive ?? body.is_active);
    if (active !== undefined) {
      patch.is_active = active;
      if (active) { patch.requires_review = false; patch.last_reviewed_at = new Date().toISOString(); }
    }

    const { data, error } = await supabaseAdmin.from("ai_knowledge").update(patch).eq("id", id).select(SELECT).single();
    if (error) throw error;

    const action = active === true && !current.is_active ? "activated"
      : active === false && current.is_active ? "deactivated" : "updated";
    await recordHistory(id, Number(data.version), action, data, access.user.id);
    return NextResponse.json({ success: true, entry: data });
  } catch (error) {
    logError("Failed to update AI knowledge", { error });
    return jsonError(error instanceof Error ? error.message : "Unable to update AI knowledge");
  }
}

export async function DELETE(req: NextRequest) {
  const response = NextResponse.next();
  const access = await requireUniversityOperationsUser(req, response, "manageRoutes");
  if (!access.authorized) return jsonError(access.error, access.status);
  if (!access.isGlobal) return jsonError("AI knowledge is managed by a global operations admin", 403);

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const id = str(body.id, 60);
    if (!id) return jsonError("id is required", 400);
    const { data: current } = await supabaseAdmin.from("ai_knowledge").select(SELECT).eq("id", id).maybeSingle();
    if (current) await recordHistory(id, Number(current.version), "deleted", current, access.user.id);
    const { error } = await supabaseAdmin.from("ai_knowledge").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ success: true, message: "Entry deleted" });
  } catch (error) {
    logError("Failed to delete AI knowledge", { error });
    return jsonError(error instanceof Error ? error.message : "Unable to delete AI knowledge");
  }
}
