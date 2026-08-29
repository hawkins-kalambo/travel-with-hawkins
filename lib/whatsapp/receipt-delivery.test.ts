import assert from "node:assert/strict";
import test, { beforeEach, mock } from "node:test";

// deliverWhatsAppReceipt is only ever reached from verifyAndFinalizePayment,
// AFTER finalize_payment has committed — a browser redirect, screenshot or
// "I paid" message can never call it. These tests pin its branch behaviour:
// it is claim-guarded, never throws past its boundary, and records a `blocked`
// (not `sent`) state outside the 24h window.

let receipt: unknown;
let contactRow: Record<string, unknown> | null;
let conversationRow: Record<string, unknown> | null;
let bookingRow: Record<string, unknown> | null;
let claimResult: { data: unknown; error: unknown };
const updates: Array<{ table: string; fields: Record<string, unknown> }> = [];
let uploadImpl: () => Promise<string>;
let deliverImpl: () => Promise<{ providerMessageId: string; messageId: string }>;
let notifyCalls = 0;

function table(name: string) {
  const api: Record<string, unknown> = {
    select: () => api, eq: () => api, order: () => api, limit: () => api,
    maybeSingle: async () => {
      if (name === "bookings") return { data: bookingRow, error: null };
      if (name === "whatsapp_contacts") return { data: contactRow, error: null };
      if (name === "whatsapp_conversations") return { data: conversationRow, error: null };
      return { data: null, error: null };
    },
    update: (fields: Record<string, unknown>) => { updates.push({ table: name, fields }); return api; },
  };
  return api;
}

mock.module("@/lib/supabaseAdmin", {
  exports: {
    supabaseAdmin: {
      from: (name: string) => table(name),
      rpc: async (fn: string) => (fn === "claim_payment_receipt_delivery" ? claimResult : { data: null, error: null }),
    },
  },
});
mock.module("@/lib/logger", { exports: { logError() {}, logWarn() {}, logInfo() {} } });
mock.module("@/lib/whatsapp/phone", { exports: { normalizeWhatsAppId: (v: unknown) => (v ? "+265991112222" : undefined) } });
mock.module("@/lib/payments/receipt-service", { exports: { loadReceiptByTxRef: async () => receipt } });
mock.module("@/lib/payments/receipt-storage", { exports: { getOrCreateReceiptPdf: async () => new Uint8Array([1, 2, 3]) } });
mock.module("@/lib/whatsapp/notifications", { exports: { notifyWhatsAppPaymentConfirmed: async () => { notifyCalls += 1; } } });
mock.module("@/lib/whatsapp/client", {
  exports: {
    uploadWhatsAppMedia: async () => uploadImpl(),
    MetaWhatsAppError: class MetaWhatsAppError extends Error { code: string; constructor(code: string) { super(code); this.code = code; } },
  },
});
mock.module("@/lib/whatsapp/repository", { exports: { deliverAttachmentAndRecord: async () => deliverImpl() } });

const { deliverWhatsAppReceipt } = await import("./receipt-delivery.ts");

const FUTURE = new Date(Date.now() + 3_600_000).toISOString();
const PAST = new Date(Date.now() - 3_600_000).toISOString();

beforeEach(() => {
  updates.length = 0;
  notifyCalls = 0;
  receipt = { paymentId: "pay-1", receipt: { bookingId: "BK-1", receiptNumber: "TWH-1", receiptPaymentType: "booking_fee", receiptAmount: 5000, receiptCurrency: "MWK", bookingFeeStatus: "paid", fareStatus: "unpaid", fare: 12000, seats: 1 } };
  bookingRow = { phone: "+265991112222", departure_id: null };
  contactRow = { id: "c-1", language: "en", consent_status: "implicit_service", service_window_expires_at: FUTURE };
  conversationRow = { conversation_id: "conv-1", mode: "human", status: "human_controlled", state_step: "agent_waiting", state_data: {}, state_version: 3 };
  claimResult = { data: true, error: null };
  uploadImpl = async () => "MEDIA-1";
  deliverImpl = async () => ({ providerMessageId: "wamid.1", messageId: "msg-1" });
});

test("no receipt for the tx ref => skipped", async () => {
  receipt = null;
  assert.equal(await deliverWhatsAppReceipt("tx"), "skipped");
});

test("no WhatsApp contact / opted out => skipped, no send", async () => {
  contactRow = { id: "c-1", consent_status: "opted_out", service_window_expires_at: FUTURE };
  assert.equal(await deliverWhatsAppReceipt("tx"), "skipped");
});

test("claim already taken => already_sent (idempotent, no duplicate)", async () => {
  claimResult = { data: false, error: null };
  assert.equal(await deliverWhatsAppReceipt("tx"), "already_sent");
});

test("outside the 24h window => blocked, recorded, never reported sent", async () => {
  contactRow!.service_window_expires_at = PAST;
  const outcome = await deliverWhatsAppReceipt("tx");
  assert.equal(outcome, "blocked");
  assert.ok(updates.some((u) => u.table === "payment_receipt_deliveries" && u.fields.status === "blocked"));
  assert.equal(notifyCalls, 1, "lightweight confirmation template still attempted");
});

test("inside the window, happy path => sent and delivery row marked sent", async () => {
  const outcome = await deliverWhatsAppReceipt("tx");
  assert.equal(outcome, "sent");
  assert.ok(updates.some((u) => u.table === "payment_receipt_deliveries" && u.fields.status === "sent"));
  assert.ok(updates.some((u) => u.table === "bookings" && u.fields.receipt_sent === true));
});

test("an upload failure => failed, does not throw, row left non-sent", async () => {
  uploadImpl = async () => { throw new Error("boom"); };
  const outcome = await deliverWhatsAppReceipt("tx");
  assert.equal(outcome, "failed");
  assert.ok(updates.some((u) => u.table === "payment_receipt_deliveries" && u.fields.status === "failed"));
  assert.ok(!updates.some((u) => u.table === "bookings"));
});

test("an ambiguous send timeout is held as 'sending', not auto-failed", async () => {
  const { MetaWhatsAppError } = await import("@/lib/whatsapp/client");
  deliverImpl = async () => { throw new MetaWhatsAppError("timeout"); };
  const outcome = await deliverWhatsAppReceipt("tx");
  assert.equal(outcome, "failed");
  const row = updates.find((u) => u.table === "payment_receipt_deliveries");
  assert.equal(row?.fields.status, "sending");
  assert.match(String(row?.fields.error_message), /ambiguous/);
});
