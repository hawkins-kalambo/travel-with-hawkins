import "server-only";

import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const BUCKET = "operator-documents";

// Documents are compliance paperwork, not just profile pictures — PDFs are
// the common case (business registration, insurance certificates) alongside
// photographed licenses/registrations.
const ALLOWED_MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export type DocumentSubjectType = "operator" | "vehicle" | "driver";

export type UploadDocumentInput = {
  operatorId: string;
  subjectType: DocumentSubjectType;
  subjectId: string;
  documentType: string;
  base64: string;
};

export type UploadDocumentResult =
  | { success: true; documentId: string }
  | { success: false; error: string };

function decodeDataUrl(base64: string): { mime: string; ext: string; buffer: Buffer } | null {
  const match = base64.match(/^data:([\w./+-]+);base64,(.+)$/);
  if (!match) return null;

  const mime = match[1];
  const ext = ALLOWED_MIME_EXT[mime];
  if (!ext) return null;

  return { mime, ext, buffer: Buffer.from(match[2], "base64") };
}

// Uploads to the private operator-documents bucket and records the
// compliance row. The caller (route handler) is responsible for verifying
// subjectId actually belongs to operatorId before calling this — this
// function trusts its inputs, same division of responsibility as
// lib/operatorRegistration.ts trusts validated route-handler input.
export async function uploadOperatorDocument(input: UploadDocumentInput): Promise<UploadDocumentResult> {
  const decoded = decodeDataUrl(input.base64);
  if (!decoded) {
    return { success: false, error: "File must be a PNG, JPEG, WEBP image or a PDF" };
  }

  // 10MB cap — generous for a scanned document/photo, small enough to keep
  // storage costs and upload time sane on a slow connection.
  if (decoded.buffer.byteLength > 10 * 1024 * 1024) {
    return { success: false, error: "File must be smaller than 10MB" };
  }

  const documentType = input.documentType.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
  if (!documentType) {
    return { success: false, error: "documentType is required" };
  }

  const path = `${input.operatorId}/${input.subjectType}/${input.subjectId}/${documentType}-${randomUUID()}.${decoded.ext}`;

  const { error: uploadError } = await supabaseAdmin.storage.from(BUCKET).upload(path, decoded.buffer, {
    contentType: decoded.mime,
    upsert: false,
  });

  if (uploadError) {
    console.error("Operator document upload failed", uploadError);
    return { success: false, error: "Failed to upload document" };
  }

  const { data: row, error: insertError } = await supabaseAdmin
    .from("operator_documents")
    .insert({
      operator_id: input.operatorId,
      subject_type: input.subjectType,
      subject_id: input.subjectId,
      document_type: documentType,
      file_path: path,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertError || !row) {
    // Best-effort cleanup so a failed DB insert doesn't leave an orphaned,
    // untracked file sitting in private storage forever.
    await supabaseAdmin.storage.from(BUCKET).remove([path]).catch(() => {});
    console.error("Failed to record operator document", insertError);
    return { success: false, error: "Failed to record document" };
  }

  return { success: true, documentId: row.id as string };
}

// Short-lived (default 5 minutes) signed URL — the only way this bucket's
// contents are ever readable, per Master Plan §7.4.
export async function getSignedDocumentUrl(filePath: string, expiresInSeconds = 300): Promise<string | null> {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(filePath, expiresInSeconds);
  if (error || !data?.signedUrl) {
    console.warn("Failed to create signed document URL", error?.message);
    return null;
  }
  return data.signedUrl;
}
