import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import { verifyMetaSignature } from "./signature.ts";

test("accepts a valid Meta sha256 signature", () => {
  const body = JSON.stringify({ object: "whatsapp_business_account" });
  const secret = "test-secret";
  const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  assert.equal(verifyMetaSignature(body, signature, secret), true);
});

test("rejects missing, malformed, and mismatched Meta signatures", () => {
  assert.equal(verifyMetaSignature("body", null, "secret"), false);
  assert.equal(verifyMetaSignature("body", "not-hex", "secret"), false);
  assert.equal(verifyMetaSignature("body", `sha256=${"0".repeat(64)}`, "secret"), false);
});
