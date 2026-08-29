import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { logError, logInfo, logWarn } from "@/lib/logger";
import { downloadWhatsAppMedia } from "@/lib/whatsapp/client";
import { INBOUND_MEDIA_TYPES, inboundMediaMaxBytes, sanitizeFilename, validateInboundMediaBytes } from "@/lib/whatsapp/media";
import type { WhatsAppInboundMessage } from "@/lib/whatsapp/types";

const BUCKET = "whatsapp-media";

type IngestTarget = { conversationId: string; contactId: string };

async function markMedia(rowId: string, fields: Record<string, unknown>): Promise<void> {
  await supabaseAdmin.from("whatsapp_media")
    .update({ ...fields, updated_at: new Date().toISOString() }).eq("id", rowId);
}

// Download a customer-sent document/image, validate the actual bytes, store it
// privately, and attach it to the transcript line. Idempotent on
// (provider_message_id, provider_media_id). Never throws: a media failure must
// not fail the surrounding text-message persistence, and a re-drive can retry.
export async function ingestInboundMedia(
  target: IngestTarget, message: WhatsAppInboundMessage, communicationMessageId: string | null,
): Promise<void> {
  const media = message.media;
  if (!media?.id) return;

  const spec = INBOUND_MEDIA_TYPES[media.mimeType];
  if (!spec) {
    // Executables, archives, audio, video, etc. are not accepted — the text
    // placeholder already shows the customer sent something.
    logWarn("WhatsApp inbound media type not accepted", {
      conversationId: target.conversationId, mimeType: media.mimeType?.slice(0, 60),
    });
    return;
  }

  const existing = await supabaseAdmin.from("whatsapp_media")
    .select("id,status")
    .eq("direction", "inbound").eq("provider_message_id", message.id).eq("provider_media_id", media.id)
    .maybeSingle();
  if (existing.data && (existing.data.status === "stored" || existing.data.status === "quarantined")) return;

  let rowId = existing.data?.id as string | undefined;
  const safeName = sanitizeFilename(media.filename || "attachment", spec.ext);
  const storagePath = `inbound/${target.conversationId}/${randomUUID()}.${spec.ext}`;

  if (!rowId) {
    const inserted = await supabaseAdmin.from("whatsapp_media").insert({
      conversation_id: target.conversationId, contact_id: target.contactId,
      message_id: communicationMessageId, direction: "inbound", kind: spec.kind,
      mime_type: media.mimeType, file_name: safeName, byte_size: 0, storage_path: storagePath,
      provider_media_id: media.id, provider_message_id: message.id,
      caption: media.caption?.slice(0, 1024) || null, status: "pending",
    }).select("id").maybeSingle();
    if (inserted.error) {
      // 23505 => a concurrent worker already inserted it; nothing to do here.
      if (inserted.error.code !== "23505") {
        logError("WhatsApp inbound media row insert failed", { conversationId: target.conversationId, code: inserted.error.code });
      }
      return;
    }
    rowId = inserted.data?.id as string;
  }
  if (!rowId) return;

  let downloaded;
  try {
    downloaded = await downloadWhatsAppMedia(media.id, inboundMediaMaxBytes());
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code).slice(0, 120) : "download_failed";
    await markMedia(rowId, { status: "failed", error_code: code });
    await bumpAttempts(rowId);
    logWarn("WhatsApp inbound media download failed", { conversationId: target.conversationId, code });
    return;
  }

  const check = validateInboundMediaBytes(downloaded.bytes, media.mimeType, media.filename || "attachment");
  if (!check.ok) {
    await markMedia(rowId, { status: "quarantined", error_code: check.reason });
    logWarn("WhatsApp inbound media quarantined", { conversationId: target.conversationId, reason: check.reason });
    return;
  }

  const sha256 = createHash("sha256").update(downloaded.bytes).digest("hex");
  const uploaded = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, Buffer.from(downloaded.bytes), {
    contentType: check.mimeType, upsert: true,
  });
  if (uploaded.error) {
    await markMedia(rowId, { status: "failed", error_code: "storage_upload_failed" });
    await bumpAttempts(rowId);
    logError("WhatsApp inbound media storage upload failed", { conversationId: target.conversationId, error: uploaded.error.message });
    return;
  }

  await markMedia(rowId, {
    status: "stored", byte_size: downloaded.bytes.length, storage_path: storagePath,
    provider_sha256: downloaded.sha256 || media.sha256 || null, sha256, error_code: null,
  });

  // Render the attachment card on the transcript bubble via the existing
  // attachments path (inbound: true tells the inbox it opens via this route).
  if (communicationMessageId) {
    await supabaseAdmin.from("communication_messages")
      .update({ attachments: [{ mediaId: rowId, kind: check.kind, fileName: safeName, inbound: true }] })
      .eq("id", communicationMessageId);
  }
  logInfo("WhatsApp inbound media stored", { conversationId: target.conversationId, kind: check.kind });
}

async function bumpAttempts(rowId: string): Promise<void> {
  const row = await supabaseAdmin.from("whatsapp_media").select("attempts").eq("id", rowId).maybeSingle();
  await supabaseAdmin.from("whatsapp_media")
    .update({ attempts: (Number(row.data?.attempts) || 0) + 1, updated_at: new Date().toISOString() })
    .eq("id", rowId);
}

// Safety net for the recover cron: retry inbound media the webhook path left
// 'failed' (transient download / storage error), under an attempt cap.
export async function redriveInboundMedia(limit = 25): Promise<{ candidates: number; stored: number }> {
  const due = await supabaseAdmin.from("whatsapp_media")
    .select("id,conversation_id,contact_id,message_id,provider_message_id,provider_media_id,mime_type,file_name,caption")
    .eq("direction", "inbound").eq("status", "failed").lt("attempts", 5)
    .order("updated_at", { ascending: true }).limit(limit);
  if (due.error) return { candidates: 0, stored: 0 };
  const rows = due.data ?? [];
  let stored = 0;
  for (const row of rows) {
    try {
      await ingestInboundMedia(
        { conversationId: row.conversation_id, contactId: row.contact_id },
        {
          kind: "message", id: row.provider_message_id, from: "", inputType: "document", text: "",
          media: { id: row.provider_media_id, mimeType: row.mime_type, filename: row.file_name || undefined, caption: row.caption || undefined },
        },
        row.message_id,
      );
      const after = await supabaseAdmin.from("whatsapp_media").select("status").eq("id", row.id).maybeSingle();
      if (after.data?.status === "stored") stored += 1;
    } catch (error) {
      logError("Inbound media re-drive threw", { error: error instanceof Error ? error.message : "unknown" });
    }
  }
  return { candidates: rows.length, stored };
}
