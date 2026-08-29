// Pure helpers for the admin Communication Center WhatsApp inbox (master plan
// §B). No server or DB imports so they can be unit-tested and reused on the
// client.

export type WhatsAppSenderKind = "customer" | "agent" | "bot" | "automatic";

export type InboxMessageRow = {
  direction?: string | null;
  sender_id?: string | null;
  provider_metadata?: Record<string, unknown> | null;
};

// How a transcript line should be attributed. `provider_metadata.origin` is the
// authoritative marker (set when the message is recorded); the sender_id
// fallback keeps older rows sensible.
export function classifySenderKind(row: InboxMessageRow): WhatsAppSenderKind {
  if ((row.direction || "").toLowerCase() === "inbound") return "customer";
  const origin = row.provider_metadata && typeof row.provider_metadata === "object"
    ? (row.provider_metadata as Record<string, unknown>).origin
    : undefined;
  if (origin === "agent" || origin === "bot" || origin === "automatic") return origin;
  return row.sender_id ? "agent" : "bot";
}

export const SENDER_KIND_LABEL: Record<WhatsAppSenderKind, string> = {
  customer: "Customer",
  agent: "Agent",
  bot: "Bot",
  automatic: "Automated",
};

// A provider delivery status is only meaningful once WhatsApp has reported it.
// Anything else ("sending", "received", "stored", null) must not be shown as a
// delivery claim.
const CONFIRMED_STATUSES = new Set(["sent", "delivered", "read", "failed"]);
export function confirmedDeliveryStatus(status?: string | null): string | null {
  const value = (status || "").toLowerCase();
  return CONFIRMED_STATUSES.has(value) ? value : null;
}

// One-line list preview. Interactive payloads and media store a bracketed
// placeholder as their body; keep it readable and bounded.
export function previewFor(body: string | null | undefined, max = 160): string {
  const text = (body || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export type InboxFilter = "all" | "unread" | "waiting" | "human" | "bot" | "resolved";

export const INBOX_FILTERS: InboxFilter[] = ["all", "unread", "waiting", "human", "bot", "resolved"];

export function isInboxFilter(value: unknown): value is InboxFilter {
  return typeof value === "string" && (INBOX_FILTERS as string[]).includes(value);
}

// Translate a UI filter into the status / unread constraint the list query
// applies. `status` maps onto whatsapp_conversations.status; `unreadOnly`
// adds unread_count > 0.
export function filterToQuery(filter: InboxFilter): { status?: string; unreadOnly?: boolean } {
  switch (filter) {
    case "unread": return { unreadOnly: true };
    case "waiting": return { status: "waiting" };
    case "human": return { status: "human_controlled" };
    case "bot": return { status: "bot_controlled" };
    case "resolved": return { status: "resolved" };
    default: return {};
  }
}
