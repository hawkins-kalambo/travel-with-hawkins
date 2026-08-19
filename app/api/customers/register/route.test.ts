import assert from "node:assert/strict";
import test, { mock } from "node:test";

let rateLimited: Record<string, boolean> = {};
let registerCustomerCalls = 0;

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

mock.module("@/lib/customerAuthAdmin", {
  exports: {
    registerCustomer: async () => {
      registerCustomerCalls += 1;
      return { success: true, userId: "cust-1", otpSent: true };
    },
  },
});

const { POST } = await import("./route.ts");

function makeRequest(body: Record<string, unknown>) {
  return new Request("https://example.com/api/customers/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];
}

const validBody = {
  email: "test@example.com",
  password: "password123",
  confirmPassword: "password123",
  fullName: "Test Customer",
  phone: "0991234567",
  customerType: "student",
};

test("POST returns 429 and never calls registerCustomer when the account is rate-limited", async () => {
  rateLimited = { account: true, ip: false };
  registerCustomerCalls = 0;
  const res = await POST(makeRequest(validBody));
  assert.equal(res.status, 429);
  assert.equal(registerCustomerCalls, 0);
});

test("POST returns 429 and never calls registerCustomer when the IP is rate-limited", async () => {
  rateLimited = { account: false, ip: true };
  registerCustomerCalls = 0;
  const res = await POST(makeRequest(validBody));
  assert.equal(res.status, 429);
  assert.equal(registerCustomerCalls, 0);
});

test("POST proceeds to registerCustomer when not rate-limited", async () => {
  rateLimited = { account: false, ip: false };
  registerCustomerCalls = 0;
  const res = await POST(makeRequest(validBody));
  assert.equal(res.status, 200);
  assert.equal(registerCustomerCalls, 1);
});
