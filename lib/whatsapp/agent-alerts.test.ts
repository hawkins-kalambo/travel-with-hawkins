import assert from "node:assert/strict";
import test, { beforeEach, mock } from "node:test";

let contactRow: { display_name?: string | null } | null;
let smsCalls: Array<Record<string, unknown>>;
let emailCalls: Array<Record<string, unknown>>;
let smsThrows: boolean;

mock.module("@/lib/supabaseAdmin", {
  exports: {
    supabaseAdmin: {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: contactRow, error: null }) }) }),
      }),
    },
  },
});
mock.module("@/lib/logger", { exports: { logError() {}, logWarn() {}, logInfo() {} } });
mock.module("@/lib/whatsapp/phone", { exports: { maskWhatsAppId: (v: string) => `masked(${v.slice(-3)})` } });
mock.module("@/lib/resend", {
  exports: { sendEmail: async (payload: Record<string, unknown>) => { emailCalls.push(payload); return { success: true }; } },
});
mock.module("@/lib/africasTalking", {
  exports: {
    sendAdminHandoffAlertSms: async (payload: Record<string, unknown>) => {
      smsCalls.push(payload);
      if (smsThrows) throw new Error("provider down");
      return { attempted: true, success: true, outcome: "sent", status: "Success" };
    },
  },
});

const { notifyAdminOfWhatsAppHandoff } = await import("./agent-alerts.ts");

const conversation = {
  conversationId: "conv-1", contactId: "c-1", waId: "+265991234567",
  language: "en", mode: "human", status: "waiting", step: "agent_waiting",
  data: {}, version: 1,
} as never;

beforeEach(() => {
  contactRow = null;
  smsCalls = [];
  emailCalls = [];
  smsThrows = false;
  delete process.env.ADMIN_NOTIFICATION_EMAIL;
});

test("fires one SMS tagged as the WhatsApp channel with a deep link", async () => {
  await notifyAdminOfWhatsAppHandoff(conversation);
  assert.equal(smsCalls.length, 1);
  assert.equal(smsCalls[0].channel, "WhatsApp");
  assert.match(String(smsCalls[0].conversationUrl), /tab=whatsapp&conversation=conv-1/);
  assert.match(String(smsCalls[0].conversationUrl), /forceLogin=1/);
});

test("passes the contact display name when there is one", async () => {
  contactRow = { display_name: "Jane Banda" };
  await notifyAdminOfWhatsAppHandoff(conversation);
  assert.equal(smsCalls[0].customerName, "Jane Banda");
});

test("omits the name when the contact has none (SMS falls back internally)", async () => {
  await notifyAdminOfWhatsAppHandoff(conversation);
  assert.equal(smsCalls[0].customerName, undefined);
});

test("an SMS provider throw is swallowed — the handoff is never broken", async () => {
  smsThrows = true;
  await assert.doesNotReject(() => notifyAdminOfWhatsAppHandoff(conversation));
});

test("email is sent only when ADMIN_NOTIFICATION_EMAIL is configured", async () => {
  await notifyAdminOfWhatsAppHandoff(conversation);
  assert.equal(emailCalls.length, 0);

  process.env.ADMIN_NOTIFICATION_EMAIL = "ops@example.com";
  await notifyAdminOfWhatsAppHandoff(conversation);
  assert.equal(emailCalls.length, 1);
  assert.equal(emailCalls[0].to, "ops@example.com");
  assert.match(String(emailCalls[0].html), /masked\(567\)/);
});
