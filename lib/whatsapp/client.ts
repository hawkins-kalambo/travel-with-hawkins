import "server-only";

import { logError, logWarn } from "@/lib/logger";
import { getWhatsAppSendConfig } from "@/lib/whatsapp/env";
import type { WhatsAppOutboundMessage } from "@/lib/whatsapp/types";

const TIMEOUT_MS = 15_000;

export class MetaWhatsAppError extends Error {
  readonly code: string;
  readonly httpStatus?: number;
  readonly retryable: boolean;

  constructor(code: string, httpStatus?: number, retryable = false) {
    super("WhatsApp messaging is temporarily unavailable.");
    this.name = "MetaWhatsAppError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryable = retryable;
  }
}

function payloadFor(to: string, message: WhatsAppOutboundMessage): Record<string, unknown> {
  const base = { messaging_product: "whatsapp", recipient_type: "individual", to };
  if (message.type === "text") return { ...base, type: "text", text: { preview_url: false, body: message.text } };
  if (message.type === "buttons") {
    if (message.buttons.length < 1 || message.buttons.length > 3) throw new MetaWhatsAppError("invalid_buttons");
    return { ...base, type: "interactive", interactive: { type: "button", body: { text: message.body }, action: { buttons: message.buttons.map((button) => ({ type: "reply", reply: { id: button.id, title: button.title.slice(0, 20) } })) } } };
  }
  if (message.type === "list") {
    if (message.rows.length < 1 || message.rows.length > 10) throw new MetaWhatsAppError("invalid_list");
    return { ...base, type: "interactive", interactive: { type: "list", body: { text: message.body }, action: { button: message.button.slice(0, 20), sections: [{ title: "Travel With Hawkins", rows: message.rows.map((row) => ({ id: row.id, title: row.title.slice(0, 24), ...(row.description ? { description: row.description.slice(0, 72) } : {}) })) }] } } };
  }
  if (message.type === "document") {
    return { ...base, type: "document", document: { id: message.mediaId, filename: message.filename.slice(0, 240), ...(message.caption ? { caption: message.caption.slice(0, 1024) } : {}) } };
  }
  if (message.type === "image") {
    return { ...base, type: "image", image: { id: message.mediaId, ...(message.caption ? { caption: message.caption.slice(0, 1024) } : {}) } };
  }
  return { ...base, type: "template", template: { name: message.name, language: { code: message.languageCode }, ...(message.parameters?.length ? { components: [{ type: "body", parameters: message.parameters.map((value) => ({ type: "text", text: value })) }] } : {}) } };
}

async function request(body: Record<string, unknown>, attempt = 0, expectMessageId = true): Promise<string> {
  const config = getWhatsAppSendConfig();
  if (!config.enabled) throw new MetaWhatsAppError("feature_disabled");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`https://graph.facebook.com/${config.apiVersion}/${encodeURIComponent(config.phoneNumberId)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: controller.signal,
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    logError("Meta WhatsApp request failed", { reason: timedOut ? "timeout" : "network_error" });
    // The provider may have accepted an ambiguous network/timeout request;
    // do not retry and risk sending a duplicate customer message.
    throw new MetaWhatsAppError(timedOut ? "timeout" : "network_error");
  } finally { clearTimeout(timeout); }

  const responseText = await response.text();
  let parsed: Record<string, unknown> = {};
  try { parsed = responseText ? JSON.parse(responseText) as Record<string, unknown> : {}; } catch { /* normalized below */ }
  if (!response.ok) {
    const retryable = response.status === 429 || response.status >= 500;
    if (retryable && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 250 : 750));
      return request(body, attempt + 1, expectMessageId);
    }
    const providerError = parsed.error && typeof parsed.error === "object" ? parsed.error as Record<string, unknown> : undefined;
    logWarn("Meta WhatsApp rejected message", { httpStatus: response.status, providerCode: providerError?.code });
    throw new MetaWhatsAppError("provider_error", response.status, retryable);
  }
  if (!expectMessageId) return "ok";
  const first = Array.isArray(parsed.messages) ? parsed.messages[0] as Record<string, unknown> | undefined : undefined;
  if (!first?.id || typeof first.id !== "string") throw new MetaWhatsAppError("malformed_response");
  return first.id;
}

export async function sendWhatsAppMessage(to: string, message: WhatsAppOutboundMessage): Promise<string> {
  return request(payloadFor(to.replace(/^\+/, ""), message));
}

export async function markWhatsAppMessageRead(messageId: string): Promise<void> {
  await request({ messaging_product: "whatsapp", status: "read", message_id: messageId }, 0, false);
}

const MEDIA_UPLOAD_TIMEOUT_MS = 30_000;

// Upload bytes to Meta's media endpoint and return the media id used by a
// document/image message. Not retried: a failed upload leaves at most an
// orphan media object (Meta expires unused media in ~30 days) and retrying
// risks sending twice from a caller that also retries.
export async function uploadWhatsAppMedia(bytes: Uint8Array, mimeType: string, filename: string): Promise<string> {
  const config = getWhatsAppSendConfig();
  if (!config.enabled) throw new MetaWhatsAppError("feature_disabled");
  const form = new FormData();
  form.set("messaging_product", "whatsapp");
  form.set("type", mimeType);
  form.set("file", new Blob([bytes as unknown as BlobPart], { type: mimeType }), filename);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MEDIA_UPLOAD_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`https://graph.facebook.com/${config.apiVersion}/${encodeURIComponent(config.phoneNumberId)}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.accessToken}` },
      body: form, signal: controller.signal,
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    logError("Meta WhatsApp media upload failed", { reason: timedOut ? "timeout" : "network_error" });
    throw new MetaWhatsAppError(timedOut ? "timeout" : "network_error");
  } finally { clearTimeout(timeout); }

  const text = await response.text();
  let parsed: Record<string, unknown> = {};
  try { parsed = text ? JSON.parse(text) as Record<string, unknown> : {}; } catch { /* handled below */ }
  if (!response.ok) {
    const providerError = parsed.error && typeof parsed.error === "object" ? parsed.error as Record<string, unknown> : undefined;
    logWarn("Meta WhatsApp rejected media upload", { httpStatus: response.status, providerCode: providerError?.code });
    throw new MetaWhatsAppError("media_upload_rejected", response.status);
  }
  if (typeof parsed.id !== "string" || !parsed.id) throw new MetaWhatsAppError("malformed_media_response");
  return parsed.id;
}
