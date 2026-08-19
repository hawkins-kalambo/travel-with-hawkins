import assert from "node:assert/strict";
import test, { mock } from "node:test";

let rateLimited: Record<string, boolean> = {};
let registerOperatorCalls = 0;

mock.module("@/lib/rateLimit", {
  exports: {
    isRateLimited: async (key: string) => {
      if (key.startsWith("register:account:")) return Boolean(rateLimited.account);
      if (key.startsWith("register:ip:")) return Boolean(rateLimited.ip);
      return false;
    },
  },
});

mock.module("@/lib/clientIp", {
  exports: { getClientIp: () => "203.0.113.1" },
});

mock.module("@/lib/operatorRegistration", {
  exports: {
    registerOperator: async () => {
      registerOperatorCalls += 1;
      return { success: true, operatorId: "op-1" };
    },
  },
});

const { POST } = await import("./route.ts");

function makeRequest(body: Record<string, unknown>) {
  return new Request("https://example.com/api/operators/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];
}

const validBody = {
  legalName: "Test Operator Ltd",
  displayName: "Test Operator",
  isIndividual: false,
  ownerFullName: "Test Owner",
  ownerEmail: "owner@example.com",
  ownerPhone: "0991234567",
  ownerPassword: "password123",
  ownerConfirmPassword: "password123",
};

test("POST returns 429 and never calls registerOperator when the account is rate-limited", async () => {
  rateLimited = { account: true, ip: false };
  registerOperatorCalls = 0;
  const res = await POST(makeRequest(validBody));
  assert.equal(res.status, 429);
  assert.equal(registerOperatorCalls, 0);
});

test("POST returns 429 and never calls registerOperator when the IP is rate-limited", async () => {
  rateLimited = { account: false, ip: true };
  registerOperatorCalls = 0;
  const res = await POST(makeRequest(validBody));
  assert.equal(res.status, 429);
  assert.equal(registerOperatorCalls, 0);
});

test("POST proceeds to registerOperator when not rate-limited", async () => {
  rateLimited = { account: false, ip: false };
  registerOperatorCalls = 0;
  const res = await POST(makeRequest(validBody));
  assert.equal(res.status, 200);
  assert.equal(registerOperatorCalls, 1);
});
