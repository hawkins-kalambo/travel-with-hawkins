import assert from "node:assert/strict";
import test, { beforeEach, mock } from "node:test";

// ingestInboundMedia downloads a customer-sent file, validates the ACTUAL
// bytes, stores it privately and attaches it to the transcript — idempotently,
// and without ever throwing (a media failure must not break text persistence).

const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]); // %PDF-1

let existingRow: { id: string; status: string } | null;
let downloadImpl: () => Promise<{ bytes: Uint8Array; mimeType: string; sha256?: string; fileSize?: number }>;
let uploadError: unknown;
const updates: Array<{ table: string; fields: Record<string, unknown> }> = [];
let inserted = 0;

function chain(table: string) {
  const api: Record<string, unknown> = {
    select: () => api, eq: () => api, lt: () => api, order: () => api, limit: () => api,
    maybeSingle: async () => {
      if (table === "whatsapp_media_lookup") return { data: existingRow, error: null };
      if (table === "whatsapp_media_attempts") return { data: { attempts: 1 }, error: null };
      return { data: null, error: null };
    },
    insert: () => {
      inserted += 1;
      return { select: () => ({ maybeSingle: async () => ({ data: { id: "row-1" }, error: null }) }) };
    },
    update: (fields: Record<string, unknown>) => { updates.push({ table, fields }); return api; },
  };
  return api;
}

// One `from("whatsapp_media")` call is the idempotency lookup, the rest are
// insert/update. Disambiguate by call order via a tiny state machine.
let mediaCall = 0;
mock.module("@/lib/supabaseAdmin", {
  exports: {
    supabaseAdmin: {
      from: (name: string) => {
        if (name === "whatsapp_media") {
          mediaCall += 1;
          if (mediaCall === 1) return chain("whatsapp_media_lookup");
          return chain("whatsapp_media");
        }
        return chain(name);
      },
      storage: { from: () => ({ upload: async () => ({ error: uploadError }) }) },
    },
  },
});
mock.module("@/lib/logger", { exports: { logError() {}, logWarn() {}, logInfo() {} } });
mock.module("@/lib/whatsapp/client", {
  exports: { downloadWhatsAppMedia: async () => downloadImpl() },
});

const { ingestInboundMedia } = await import("./inbound-media.ts");

const target = { conversationId: "conv-1", contactId: "c-1" };
function message(mime = "application/pdf") {
  return {
    kind: "message", id: "wamid.1", from: "+265991234567", inputType: "document", text: "",
    media: { id: "MEDIA-1", mimeType: mime, filename: "proof.pdf" },
  } as never;
}

beforeEach(() => {
  existingRow = null;
  downloadImpl = async () => ({ bytes: pdf, mimeType: "application/pdf", sha256: "meta-sha" });
  uploadError = null;
  updates.length = 0;
  inserted = 0;
  mediaCall = 0;
});

test("unsupported declared type: nothing stored, no row created", async () => {
  await ingestInboundMedia(target, message("application/x-msdownload"), "msg-1");
  assert.equal(inserted, 0);
  assert.equal(updates.length, 0);
});

test("already stored: idempotent no-op (no download, no update)", async () => {
  existingRow = { id: "row-1", status: "stored" };
  await ingestInboundMedia(target, message(), "msg-1");
  assert.equal(inserted, 0);
  assert.equal(updates.length, 0);
});

test("happy path: pending row -> stored, transcript attachment backfilled", async () => {
  await ingestInboundMedia(target, message(), "msg-1");
  assert.equal(inserted, 1);
  assert.ok(updates.some((u) => u.table === "whatsapp_media" && u.fields.status === "stored"));
  const attach = updates.find((u) => u.table === "communication_messages");
  assert.ok(attach, "communication_messages.attachments updated");
  assert.equal((attach!.fields.attachments as Array<{ inbound?: boolean }>)[0].inbound, true);
});

test("bad bytes: row is quarantined, not stored", async () => {
  downloadImpl = async () => ({ bytes: new Uint8Array([0x4d, 0x5a, 0x90]), mimeType: "application/pdf" });
  await ingestInboundMedia(target, message(), "msg-1");
  assert.ok(updates.some((u) => u.fields.status === "quarantined"));
  assert.ok(!updates.some((u) => u.fields.status === "stored"));
});

test("download failure: row marked failed, attempts bumped, never throws", async () => {
  downloadImpl = async () => { throw Object.assign(new Error("x"), { code: "timeout" }); };
  await assert.doesNotReject(() => ingestInboundMedia(target, message(), "msg-1"));
  assert.ok(updates.some((u) => u.fields.status === "failed"));
  assert.ok(updates.some((u) => typeof u.fields.attempts === "number"));
});

test("storage upload failure: row marked failed, not stored", async () => {
  uploadError = { message: "bucket denied" };
  await ingestInboundMedia(target, message(), "msg-1");
  assert.ok(updates.some((u) => u.fields.status === "failed"));
  assert.ok(!updates.some((u) => u.fields.status === "stored"));
});
