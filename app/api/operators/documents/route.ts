import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jsonError } from "@/lib/apiResponse";
import { requireOperatorUser } from "@/lib/operatorAuth";
import { uploadOperatorDocument, type DocumentSubjectType } from "@/lib/operatorDocuments";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const SUBJECT_TYPES: DocumentSubjectType[] = ["operator", "vehicle", "driver"];

// Confirms subjectId actually belongs to this operator before any upload
// touches storage — otherwise a compromised or malicious owner account
// could attach documents to (or, more importantly, later have them
// reviewed/approved against) a vehicle or driver row it doesn't own.
async function subjectBelongsToOperator(operatorId: string, subjectType: DocumentSubjectType, subjectId: string): Promise<boolean> {
  if (subjectType === "operator") return subjectId === operatorId;

  const table = subjectType === "vehicle" ? "vehicles" : "drivers";
  const { data, error } = await supabaseAdmin.from(table).select("id").eq("id", subjectId).eq("operator_id", operatorId).maybeSingle();
  return !error && Boolean(data);
}

export async function POST(request: NextRequest) {
  const response = NextResponse.next();
  const auth = await requireOperatorUser(request, response, "manageDocuments");
  if (!auth.authorized) return jsonError(auth.error, auth.status);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const subjectType = typeof body.subjectType === "string" ? (body.subjectType as DocumentSubjectType) : undefined;
  const subjectId = typeof body.subjectId === "string" ? body.subjectId.trim() : "";
  const documentType = typeof body.documentType === "string" ? body.documentType : "";
  const base64 = typeof body.file === "string" ? body.file : "";

  if (!subjectType || !SUBJECT_TYPES.includes(subjectType)) return jsonError("Unsupported subjectType", 400);
  if (!subjectId) return jsonError("subjectId is required", 400);
  if (!documentType) return jsonError("documentType is required", 400);
  if (!base64) return jsonError("file is required", 400);

  const belongs = await subjectBelongsToOperator(auth.operatorId, subjectType, subjectId);
  if (!belongs) return jsonError("subjectId does not belong to your operator", 403);

  const result = await uploadOperatorDocument({
    operatorId: auth.operatorId,
    subjectType,
    subjectId,
    documentType,
    base64,
  });

  if (!result.success) return jsonError(result.error, 400);

  return NextResponse.json({ success: true, documentId: result.documentId });
}

export async function GET(request: NextRequest) {
  const response = NextResponse.next();
  const auth = await requireOperatorUser(request, response);
  if (!auth.authorized) return jsonError(auth.error, auth.status);

  const { data, error } = await supabaseAdmin
    .from("operator_documents")
    .select("id, subject_type, subject_id, document_type, status, expires_at, rejection_reason, created_at")
    .eq("operator_id", auth.operatorId)
    .order("created_at", { ascending: false });

  if (error) return jsonError("Unable to load documents", 500);

  return NextResponse.json({ success: true, documents: data ?? [] });
}
