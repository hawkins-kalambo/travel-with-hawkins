import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jsonError } from "@/lib/apiResponse";
import { requireAdminUser } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSignedDocumentUrl } from "@/lib/operatorDocuments";

const REVIEW_STATUSES = ["pending", "verified", "rejected", "expiring", "expired", "replaced"] as const;
type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request, NextResponse.next());
  if (!auth.authorized || !auth.user) return jsonError(auth.error ?? "Admin access required", 403);

  const params = new URL(request.url).searchParams;
  const statusFilter = params.get("status");
  const operatorId = params.get("operatorId");

  let query = supabaseAdmin
    .from("operator_documents")
    .select("id, operator_id, subject_type, subject_id, document_type, file_path, status, expires_at, rejection_reason, created_at, operators(display_name)")
    .order("created_at", { ascending: false });

  if (statusFilter && (REVIEW_STATUSES as readonly string[]).includes(statusFilter)) {
    query = query.eq("status", statusFilter);
  }
  if (operatorId) {
    query = query.eq("operator_id", operatorId);
  }

  const { data, error } = await query;
  if (error) return jsonError("Unable to load documents", 500);

  const documents = await Promise.all(
    (data ?? []).map(async (row) => ({
      id: row.id,
      operatorId: row.operator_id,
      operatorDisplayName: (row.operators as { display_name?: string } | null)?.display_name ?? null,
      subjectType: row.subject_type,
      subjectId: row.subject_id,
      documentType: row.document_type,
      status: row.status,
      expiresAt: row.expires_at,
      rejectionReason: row.rejection_reason,
      createdAt: row.created_at,
      // Short-lived — regenerated on every list request, never persisted.
      signedUrl: await getSignedDocumentUrl(row.file_path as string),
    }))
  );

  return NextResponse.json({ success: true, documents });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdminUser(request, NextResponse.next());
  if (!auth.authorized || !auth.user) return jsonError(auth.error ?? "Admin access required", 403);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const documentId = typeof body.documentId === "string" ? body.documentId.trim() : "";
  const status = typeof body.status === "string" ? (body.status as ReviewStatus) : undefined;
  const rejectionReason = typeof body.rejectionReason === "string" ? body.rejectionReason.trim() : undefined;

  if (!documentId) return jsonError("documentId is required", 400);
  if (!status || !(REVIEW_STATUSES as readonly string[]).includes(status)) return jsonError("Unsupported status", 400);
  if (status === "rejected" && (!rejectionReason || rejectionReason.length < 5)) {
    return jsonError("A rejection reason of at least 5 characters is required", 400);
  }

  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("operator_documents")
    .select("*")
    .eq("id", documentId)
    .maybeSingle();

  if (lookupError) return jsonError("Unable to load document", 500);
  if (!existing) return jsonError("Document not found", 404);

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("operator_documents")
    .update({
      status,
      reviewed_by: auth.user.id,
      reviewed_at: new Date().toISOString(),
      rejection_reason: status === "rejected" ? rejectionReason : null,
    })
    .eq("id", documentId)
    .select()
    .maybeSingle();

  if (updateError || !updated) return jsonError("Unable to update document", 500);

  await supabaseAdmin.from("audit_logs").insert({
    actor_user_id: auth.user.id,
    actor_role: auth.role ?? "admin",
    action: status === "verified" ? "verify_operator_document" : status === "rejected" ? "reject_operator_document" : "update_operator_document",
    entity_type: "operator_document",
    entity_id: documentId,
    operator_id: existing.operator_id,
    previous_value: existing,
    new_value: updated,
  });

  return NextResponse.json({ success: true, document: updated });
}
