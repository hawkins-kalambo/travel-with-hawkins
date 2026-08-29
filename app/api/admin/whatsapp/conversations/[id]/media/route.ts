import { NextResponse, type NextRequest } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { jsonError } from "@/lib/apiResponse";
import { approvedTemplateNames, requireWhatsAppAdmin } from "@/lib/whatsapp/admin";
import { deliverAttachmentAndRecord } from "@/lib/whatsapp/repository";
import { uploadWhatsAppMedia } from "@/lib/whatsapp/client";
import {
  mediaReasonMessage, validateMediaBytes, validateMediaClaim,
} from "@/lib/whatsapp/media";
import type { WhatsAppConversationState, WhatsAppLanguage } from "@/lib/whatsapp/types";

export const runtime = "nodejs";

const BUCKET = "whatsapp-media";

type HumanConversation = WhatsAppConversationState & { assignedTo: string | null };

async function loadOwnedConversation(id: string, viewerId: string):
  Promise<{ ok: true; conversation: HumanConversation } | { ok: false; status: number; error: string }> {
  const result = await supabaseAdmin.from("whatsapp_conversations")
    .select("*,contact:whatsapp_contacts(*)").eq("conversation_id", id).maybeSingle();
  if (result.error || !result.data) return { ok: false, status: 404, error: "Conversation not found" };
  const contact = Array.isArray(result.data.contact) ? result.data.contact[0] : result.data.contact;
  const conversation: HumanConversation = {
    conversationId: id, contactId: contact.id, waId: contact.wa_id,
    language: contact.language as WhatsAppLanguage, mode: result.data.mode, status: result.data.status,
    step: result.data.state_step, data: result.data.state_data || {}, version: Number(result.data.state_version),
    serviceWindowExpiresAt: contact.service_window_expires_at, assignedTo: result.data.assigned_to ?? null,
  };
  if (conversation.mode !== "human") return { ok: false, status: 409, error: "Take over the conversation before sending a file" };
  if (conversation.assignedTo && conversation.assignedTo !== viewerId) {
    return { ok: false, status: 409, error: "Another agent holds this conversation" };
  }
  return { ok: true, conversation };
}

// Step 1: reserve a media row and hand back a short-lived, single-path signed
// UPLOAD url. The bytes never pass through this function (Vercel body limit /
// large PDFs) — the client PUTs them straight to storage.
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = await requireWhatsAppAdmin(req);
  if (!access.authorized) return jsonError(access.error, access.status);
  const { id } = await context.params;
  const owned = await loadOwnedConversation(id, access.user.id);
  if (!owned.ok) return jsonError(owned.error, owned.status);

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const fileName = typeof body.fileName === "string" ? body.fileName : "";
  const mimeType = typeof body.mimeType === "string" ? body.mimeType : "";
  const byteSize = Number(body.byteSize);
  const claim = validateMediaClaim(mimeType, byteSize, fileName);
  if (!claim.ok) return jsonError(mediaReasonMessage(claim.reason), 422);

  const mediaId = randomUUID();
  const storagePath = `${id}/${mediaId}.${claim.ext}`;
  const inserted = await supabaseAdmin.from("whatsapp_media").insert({
    id: mediaId, conversation_id: id, contact_id: owned.conversation.contactId,
    kind: claim.kind, mime_type: claim.mimeType, file_name: claim.safeName,
    byte_size: Math.round(byteSize), storage_path: storagePath, status: "pending",
    uploaded_by: access.user.id,
  }).select("id").single();
  if (inserted.error) return jsonError("Unable to start the upload", 500);

  const signed = await supabaseAdmin.storage.from(BUCKET).createSignedUploadUrl(storagePath);
  if (signed.error || !signed.data) {
    await supabaseAdmin.from("whatsapp_media").delete().eq("id", mediaId);
    return jsonError("Unable to start the upload", 500);
  }
  return NextResponse.json({
    success: true, mediaId, uploadUrl: signed.data.signedUrl,
    fileName: claim.safeName, kind: claim.kind,
  });
}

// Step 2: validate the stored bytes server-side (magic bytes — the declared
// type is never trusted), check the 24h window NOW, upload to Meta and send.
export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = await requireWhatsAppAdmin(req);
  if (!access.authorized) return jsonError(access.error, access.status);
  const { id } = await context.params;
  const owned = await loadOwnedConversation(id, access.user.id);
  if (!owned.ok) return jsonError(owned.error, owned.status);
  const conversation = owned.conversation;

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const mediaId = typeof body.mediaId === "string" ? body.mediaId : "";
  const caption = typeof body.caption === "string" ? body.caption.replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, 1024) : "";
  const templateName = typeof body.templateName === "string" ? body.templateName.trim() : "";
  if (!mediaId) return jsonError("mediaId is required", 400);

  const row = await supabaseAdmin.from("whatsapp_media").select("*").eq("id", mediaId).maybeSingle();
  if (row.error || !row.data) return jsonError("Attachment not found", 404);
  // Bind to this conversation AND its recipient — an id cannot be swapped to
  // reach another customer's file.
  if (row.data.conversation_id !== id || row.data.contact_id !== conversation.contactId) {
    return jsonError("Attachment does not belong to this conversation", 403);
  }
  if (row.data.status === "sent" || row.data.status === "sending") {
    return NextResponse.json({ success: false, error: `Attachment is already ${row.data.status}` }, { status: 409 });
  }

  const download = await supabaseAdmin.storage.from(BUCKET).download(row.data.storage_path);
  if (download.error || !download.data) {
    await supabaseAdmin.from("whatsapp_media").update({ status: "failed", error_code: "missing_upload" }).eq("id", mediaId);
    return jsonError("The uploaded file could not be read. Upload it again.", 409);
  }
  const bytes = new Uint8Array(await download.data.arrayBuffer());
  const check = validateMediaBytes(bytes, String(row.data.mime_type || ""), String(row.data.file_name || ""));
  if (!check.ok) {
    await supabaseAdmin.from("whatsapp_media").update({ status: "failed", error_code: check.reason }).eq("id", mediaId);
    return jsonError(mediaReasonMessage(check.reason), 422);
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  // §6 — the customer-service window governs media at ACTUAL send time. An
  // outgoing message does not reopen it.
  const insideWindow = conversation.serviceWindowExpiresAt && new Date(conversation.serviceWindowExpiresAt).getTime() > Date.now();
  if (!insideWindow) {
    // Sending a file outside the window needs an approved utility template with
    // a document header. None is wired up at launch, so record the blocked
    // state and tell the agent — never report it as sent.
    const usable = templateName && approvedTemplateNames().has(templateName);
    await supabaseAdmin.from("whatsapp_media").update({
      status: "blocked", error_code: "outside_window", sha256,
      caption: caption || null, template_name: templateName || null,
    }).eq("id", mediaId);
    return NextResponse.json({
      success: false, blocked: true,
      error: usable
        ? "Outside the 24-hour window, document-header templates are not enabled yet. The file is saved here; ask the customer to message first, then resend."
        : "The 24-hour customer-service window has closed. The file is saved here — ask the customer to send a message, then resend it within the window.",
    }, { status: 409 });
  }

  const claimed = await supabaseAdmin.rpc("claim_whatsapp_media_send", { p_media_id: mediaId });
  const claimRow = Array.isArray(claimed.data) ? claimed.data[0] : claimed.data;
  if (claimed.error || !claimRow?.claimed) {
    return NextResponse.json({ success: false, error: `Attachment is ${claimRow?.status || "not sendable"}` }, { status: 409 });
  }

  let providerMediaId: string;
  try {
    providerMediaId = await uploadWhatsAppMedia(bytes, check.mimeType, check.safeName);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code).slice(0, 120) : "media_upload_failed";
    await supabaseAdmin.from("whatsapp_media").update({ status: "failed", error_code: code }).eq("id", mediaId);
    return jsonError("The file could not be uploaded to WhatsApp. Nothing was sent.", 502);
  }

  const descriptor = { mediaId, kind: check.kind, fileName: check.safeName, mimeType: check.mimeType, byteSize: bytes.length };
  const outbound = check.kind === "document"
    ? { type: "document" as const, mediaId: providerMediaId, filename: check.safeName, caption: caption || undefined }
    : { type: "image" as const, mediaId: providerMediaId, caption: caption || undefined };
  try {
    const sent = await deliverAttachmentAndRecord(conversation, outbound, access.user.id, [descriptor]);
    await supabaseAdmin.from("whatsapp_media").update({
      status: "sent", provider_media_id: providerMediaId, message_id: sent.messageId,
      sha256, caption: caption || null, error_code: null,
    }).eq("id", mediaId);
    return NextResponse.json({ success: true, status: "sent", messageId: sent.messageId });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code).slice(0, 120) : "send_failed";
    await supabaseAdmin.from("whatsapp_media").update({ status: "failed", error_code: code, provider_media_id: providerMediaId, sha256 }).eq("id", mediaId);
    return jsonError("WhatsApp did not accept the message. Nothing was delivered.", 502);
  }
}

// Authenticated inline download. No public or signed READ url is ever exposed;
// the bytes are streamed through this admin-guarded route, bound to the
// conversation in the path.
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = await requireWhatsAppAdmin(req);
  if (!access.authorized) return jsonError(access.error, access.status);
  const { id } = await context.params;
  const mediaId = new URL(req.url).searchParams.get("mediaId")?.trim() || "";
  if (!mediaId) return jsonError("mediaId is required", 400);

  const row = await supabaseAdmin.from("whatsapp_media").select("conversation_id,storage_path,mime_type,file_name").eq("id", mediaId).maybeSingle();
  if (row.error || !row.data || row.data.conversation_id !== id) return jsonError("Attachment not found", 404);

  const download = await supabaseAdmin.storage.from(BUCKET).download(row.data.storage_path);
  if (download.error || !download.data) return jsonError("Attachment file is unavailable", 404);
  const buffer = Buffer.from(await download.data.arrayBuffer());
  const safeName = String(row.data.file_name || "attachment").replace(/[^A-Za-z0-9._ -]/g, "");
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": String(row.data.mime_type || "application/octet-stream"),
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Content-Length": String(buffer.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

// Review a received (inbound) attachment: link it to one of the conversation's
// bookings and/or flag it as payment proof. Records the reviewing admin.
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = await requireWhatsAppAdmin(req);
  if (!access.authorized) return jsonError(access.error, access.status);
  const { id } = await context.params;
  const owned = await loadOwnedConversation(id, access.user.id);
  if (!owned.ok) return jsonError(owned.error, owned.status);

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const mediaId = typeof body.mediaId === "string" ? body.mediaId.trim() : "";
  if (!mediaId) return jsonError("mediaId is required", 400);

  const row = await supabaseAdmin.from("whatsapp_media")
    .select("conversation_id,contact_id,direction").eq("id", mediaId).maybeSingle();
  if (row.error || !row.data || row.data.conversation_id !== id || row.data.contact_id !== owned.conversation.contactId) {
    return jsonError("Attachment not found", 404);
  }
  if (row.data.direction !== "inbound") return jsonError("Only received attachments can be reviewed", 400);

  const patch: Record<string, unknown> = { reviewed_by: access.user.id, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  if ("linkedBookingId" in body) {
    const bookingId = typeof body.linkedBookingId === "string" ? body.linkedBookingId.trim() : "";
    if (bookingId) {
      // The booking must belong to this conversation's contact.
      const booking = await supabaseAdmin.from("bookings").select("booking_id").eq("booking_id", bookingId).eq("phone", owned.conversation.waId).maybeSingle();
      if (!booking.data) return jsonError("That booking is not linked to this conversation", 400);
      patch.linked_booking_id = bookingId;
    } else {
      patch.linked_booking_id = null;
    }
  }
  if ("isPaymentProof" in body) patch.is_payment_proof = body.isPaymentProof === true;

  const updated = await supabaseAdmin.from("whatsapp_media").update(patch).eq("id", mediaId)
    .select("id,linked_booking_id,is_payment_proof").maybeSingle();
  if (updated.error || !updated.data) return jsonError("Unable to update the attachment", 500);
  return NextResponse.json({ success: true, media: updated.data });
}

// Remove an upload that has not been sent (composer "remove before send", or
// clearing a failed/blocked attempt).
export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = await requireWhatsAppAdmin(req);
  if (!access.authorized) return jsonError(access.error, access.status);
  const { id } = await context.params;
  const owned = await loadOwnedConversation(id, access.user.id);
  if (!owned.ok) return jsonError(owned.error, owned.status);
  const mediaId = new URL(req.url).searchParams.get("mediaId")?.trim() || "";
  if (!mediaId) return jsonError("mediaId is required", 400);

  const row = await supabaseAdmin.from("whatsapp_media").select("conversation_id,contact_id,storage_path,status").eq("id", mediaId).maybeSingle();
  if (row.error || !row.data || row.data.conversation_id !== id || row.data.contact_id !== owned.conversation.contactId) {
    return jsonError("Attachment not found", 404);
  }
  if (row.data.status === "sent" || row.data.status === "sending") {
    return jsonError("A sent attachment cannot be removed", 409);
  }
  await supabaseAdmin.storage.from(BUCKET).remove([row.data.storage_path]);
  await supabaseAdmin.from("whatsapp_media").delete().eq("id", mediaId);
  return NextResponse.json({ success: true });
}
