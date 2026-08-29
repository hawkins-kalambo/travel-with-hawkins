import { createHash } from "node:crypto";
import { normalizeWhatsAppId } from "@/lib/whatsapp/phone";
import type { WhatsAppInboundMedia, WhatsAppParsedEvent } from "@/lib/whatsapp/types";

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 4096) : "";
}

export function parseWhatsAppWebhook(payload: unknown): WhatsAppParsedEvent[] {
  const root = record(payload);
  if (root?.object !== "whatsapp_business_account") return [];
  const events: WhatsAppParsedEvent[] = [];

  for (const entryValue of array(root.entry)) {
    const entry = record(entryValue);
    const accountId = text(entry?.id) || undefined;
    for (const changeValue of array(entry?.changes)) {
      const change = record(changeValue);
      if (change?.field !== "messages") continue;
      const value = record(change.value);
      const phoneNumberId = text(record(value?.metadata)?.phone_number_id) || undefined;
      const contact = record(array(value?.contacts)[0]);
      const profile = record(contact?.profile);

      for (const messageValue of array(value?.messages)) {
        const message = record(messageValue);
        const id = text(message?.id);
        const from = normalizeWhatsAppId(message?.from);
        if (!id || !from) continue;

        const type = text(message?.type);
        let inputType: "text" | "button" | "list" | "document" | "image" | "unknown" = "unknown";
        let body = "";
        let actionId: string | undefined;
        let media: WhatsAppInboundMedia | undefined;
        if (type === "text") {
          inputType = "text";
          body = text(record(message?.text)?.body);
        } else if (type === "button") {
          inputType = "button";
          body = text(record(message?.button)?.text);
          actionId = text(record(message?.button)?.payload) || undefined;
        } else if (type === "interactive") {
          const interactive = record(message?.interactive);
          const interactiveType = text(interactive?.type);
          const reply = interactiveType === "button_reply" ? record(interactive?.button_reply) : record(interactive?.list_reply);
          inputType = interactiveType === "button_reply" ? "button" : interactiveType === "list_reply" ? "list" : "unknown";
          body = text(reply?.title);
          actionId = text(reply?.id) || undefined;
        } else if (type === "document" || type === "image") {
          const node = record((message as Record<string, unknown>)?.[type]);
          const mediaId = text(node?.id);
          if (mediaId) {
            const caption = text(node?.caption).slice(0, 1024) || undefined;
            const filename = type === "document" ? (text(node?.filename).slice(0, 240) || undefined) : undefined;
            media = { id: mediaId, mimeType: text(node?.mime_type), filename, caption, sha256: text(node?.sha256) || undefined };
            inputType = type;
            body = caption || (type === "document" ? `[document: ${filename || "file"}]` : "[image]");
          }
        }

        events.push({
          kind: "message", id, from, timestamp: text(message?.timestamp) || undefined,
          displayName: text(profile?.name).slice(0, 120) || undefined,
          inputType, text: body, actionId, accountId, phoneNumberId,
          ...(media ? { media } : {}),
        });
      }

      for (const statusValue of array(value?.statuses)) {
        const status = record(statusValue);
        const id = text(status?.id);
        if (!id) continue;
        const error = record(array(status?.errors)[0]);
        events.push({
          kind: "status", id, status: text(status?.status) || "unknown",
          timestamp: text(status?.timestamp) || undefined,
          recipientId: normalizeWhatsAppId(status?.recipient_id),
          errorCode: error?.code == null ? undefined : text(String(error.code)).slice(0, 80),
          accountId, phoneNumberId,
        });
      }
    }
  }
  return events;
}

export function webhookEventKey(event: WhatsAppParsedEvent): string {
  if (event.kind === "message") return `meta:message:${event.id}`;
  const digest = createHash("sha256").update(`${event.id}|${event.status}|${event.timestamp || ""}`).digest("hex");
  return `meta:status:${digest}`;
}

export function toStoredEventData(event: WhatsAppParsedEvent): Record<string, unknown> {
  return event.kind === "message"
    ? { kind: event.kind, id: event.id, from: event.from, timestamp: event.timestamp, displayName: event.displayName, inputType: event.inputType, text: event.text, actionId: event.actionId, ...(event.media ? { media: event.media } : {}) }
    : { kind: event.kind, id: event.id, status: event.status, timestamp: event.timestamp, recipientId: event.recipientId, errorCode: event.errorCode };
}

export type ExpectedWhatsAppAccount = { wabaId: string; phoneNumberId: string };

// Single-business integration: only accept events whose WhatsApp Business
// Account ID and phone number ID both match server-side configuration. Meta
// can deliver a mixed batch (multiple entries/changes in one POST), so this
// filters per event rather than rejecting the whole payload, and never
// includes the customer identity in what it returns to the caller for logging.
export function partitionEventsByAccount(
  events: WhatsAppParsedEvent[],
  expected: ExpectedWhatsAppAccount,
): { accepted: WhatsAppParsedEvent[]; rejected: number } {
  const accepted: WhatsAppParsedEvent[] = [];
  let rejected = 0;
  for (const event of events) {
    const matches = Boolean(expected.wabaId) && Boolean(expected.phoneNumberId)
      && event.accountId === expected.wabaId
      && event.phoneNumberId === expected.phoneNumberId;
    if (matches) accepted.push(event);
    else rejected += 1;
  }
  return { accepted, rejected };
}
