import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { createHmac } from "node:crypto";

// These tests only exercise the paths that return before touching the
// database (signature verification, payload shape) — that's the
// security-critical surface: a broken signature check here means any
// caller can forge a "payment succeeded" event. Deeper coverage of the
// idempotency/claim/finalize paths would need a fuller supabaseAdmin query
// mock and is left as a follow-up.

const WEBHOOK_SECRET = "test-webhook-secret";
process.env.PAYCHANGU_SECRET_KEY = "test-secret-key";
process.env.PAYCHANGU_WEBHOOK_SECRET = WEBHOOK_SECRET;

// The route module is never expected to reach these in the scenarios below,
// but its top-level imports still need something loadable in place of a
// real Supabase client / finalize flow.
mock.module("@/lib/supabaseAdmin", {
  exports: { supabaseAdmin: {} },
});
mock.module("@/lib/payments/finalize-flow", {
  exports: {
    verifyAndFinalizePayment: async () => {
      throw new Error("not expected to be called by these tests");
    },
  },
});

const { POST } = await import("./route.ts");

function sign(body: string) {
  return createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
}

function makeRequest(body: string, signature?: string) {
  return new Request("https://example.com/api/payments/webhook", {
    method: "POST",
    headers: signature ? { signature } : undefined,
    body,
  }) as unknown as Parameters<typeof POST>[0];
}

test("rejects a request with no signature header", async () => {
  const res = await POST(makeRequest(JSON.stringify({ tx_ref: "abc" })));
  assert.equal(res.status, 401);
});

test("rejects a request with a malformed (non-hex) signature header", async () => {
  const res = await POST(makeRequest(JSON.stringify({ tx_ref: "abc" }), "not-a-signature"));
  assert.equal(res.status, 401);
});

test("rejects a request whose signature does not match the body", async () => {
  const body = JSON.stringify({ tx_ref: "abc" });
  const res = await POST(makeRequest(body, sign("a different body entirely")));
  assert.equal(res.status, 401);
});

test("accepts a correctly signed request but rejects malformed JSON", async () => {
  const body = "{not valid json";
  const res = await POST(makeRequest(body, sign(body)));
  assert.equal(res.status, 400);
});

test("accepts a correctly signed, valid request but rejects a missing tx_ref", async () => {
  const body = JSON.stringify({ event_type: "charge.success" });
  const res = await POST(makeRequest(body, sign(body)));
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.equal(json.success, false);
});
