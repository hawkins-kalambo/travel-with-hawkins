import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { escapeLikePattern } from "@/lib/supabaseServer";
import { sendBulkSms } from "@/lib/africasTalking";
import { resend } from "@/lib/resend";
import { logError, logInfo, logWarn } from "@/lib/logger";

// Admin-written messages to customers who have booked with us. Contacts are
// captured by a trigger on bookings (db/migrations/2026_10_22_customer_contacts_and_messages.sql),
// so this module only reads them -- it never creates contacts itself.

export type MessageChannel = "sms" | "email";
export type MessageAudience = "all" | "selected";
type DeliveryStatus = "sent" | "failed" | "skipped";

export type CustomerContact = {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  booking_count: number;
  last_destination: string | null;
  last_booked_at: string | null;
  last_source: string | null;
  sms_opt_out: boolean;
  email_opt_out: boolean;
};

const CONTACT_COLUMNS = "id, phone, name, email, booking_count, last_destination, last_booked_at, last_source, sms_opt_out, email_opt_out";
const PAGE_SIZE = 1000;
const EMAIL_BATCH_SIZE = 100;
const INSERT_CHUNK_SIZE = 500;
const EMAIL_FROM = "Travel With Hawkins <contact@travelwithhawkins.com>";
export const MAX_MESSAGE_LENGTH = 2000;

export async function listCustomerContacts({
  search,
  limit,
  offset,
}: {
  search?: string;
  limit: number;
  offset: number;
}): Promise<{ contacts: CustomerContact[]; total: number }> {
  let query = supabaseAdmin
    .from("customer_contacts")
    .select(CONTACT_COLUMNS, { count: "exact" })
    .order("last_booked_at", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  const term = search?.trim().replace(/[,()]/g, " ");
  if (term) {
    const pattern = `%${escapeLikePattern(term)}%`;
    query = query.or(`name.ilike.${pattern},phone.ilike.${pattern},email.ilike.${pattern},last_destination.ilike.${pattern}`);
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { contacts: (data ?? []) as CustomerContact[], total: count ?? 0 };
}

export async function setContactOptOut(
  id: string,
  updates: { sms_opt_out?: boolean; email_opt_out?: boolean }
): Promise<CustomerContact> {
  const { data, error } = await supabaseAdmin
    .from("customer_contacts")
    .update(updates)
    .eq("id", id)
    .select(CONTACT_COLUMNS)
    .single();
  if (error) throw error;
  return data as CustomerContact;
}

async function loadRecipients(audience: MessageAudience, contactIds: string[]): Promise<CustomerContact[]> {
  if (audience === "selected") {
    const contacts: CustomerContact[] = [];
    for (let index = 0; index < contactIds.length; index += PAGE_SIZE) {
      const { data, error } = await supabaseAdmin
        .from("customer_contacts")
        .select(CONTACT_COLUMNS)
        .in("id", contactIds.slice(index, index + PAGE_SIZE));
      if (error) throw error;
      contacts.push(...((data ?? []) as CustomerContact[]));
    }
    return contacts;
  }

  // PostgREST caps a single response, so page through every contact.
  const contacts: CustomerContact[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin
      .from("customer_contacts")
      .select(CONTACT_COLUMNS)
      .order("id")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    contacts.push(...((data ?? []) as CustomerContact[]));
    if (!data || data.length < PAGE_SIZE) return contacts;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildEmailHtml(subject: string, body: string): string {
  const paragraphs = escapeHtml(body).replace(/\r?\n/g, "<br />");
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2937">
      <h2 style="color:#0a4d8c;margin:0 0 16px">${escapeHtml(subject)}</h2>
      <p style="font-size:15px;line-height:1.6;margin:0">${paragraphs}</p>
      <p style="font-size:12px;color:#6b7280;margin-top:24px">Travel With Hawkins</p>
    </div>
  `;
}

async function sendEmails(
  emails: string[],
  subject: string,
  body: string
): Promise<Map<string, { status: DeliveryStatus; id?: string }>> {
  const results = new Map<string, { status: DeliveryStatus; id?: string }>();
  if (!resend) {
    logWarn("Customer message email skipped because RESEND_API_KEY is not configured", { recipients: emails.length });
    for (const email of emails) results.set(email, { status: "failed" });
    return results;
  }

  const html = buildEmailHtml(subject, body);
  for (let index = 0; index < emails.length; index += EMAIL_BATCH_SIZE) {
    const chunk = emails.slice(index, index + EMAIL_BATCH_SIZE);
    try {
      const response = await resend.batch.send(chunk.map((to) => ({ from: EMAIL_FROM, to, subject, html })));
      if (response.error) throw new Error(response.error.message);
      const ids = response.data?.data ?? [];
      chunk.forEach((email, position) => results.set(email, { status: "sent", id: ids[position]?.id }));
    } catch (error) {
      logError("Customer message email batch failed", {
        recipients: chunk.length,
        error: error instanceof Error ? error.message : String(error),
      });
      for (const email of chunk) results.set(email, { status: "failed" });
    }
  }
  return results;
}

export type SendCustomerMessageInput = {
  subject?: string;
  body: string;
  channels: MessageChannel[];
  audience: MessageAudience;
  contactIds: string[];
  createdBy: string;
};

export type SendCustomerMessageSummary = {
  messageId: string;
  status: "sent" | "partial" | "failed";
  recipientCount: number;
  sms: { sent: number; failed: number; skipped: number };
  email: { sent: number; failed: number; skipped: number };
};

export async function sendCustomerMessage(input: SendCustomerMessageInput): Promise<SendCustomerMessageSummary> {
  const subject = input.subject?.trim() || "Message from Travel With Hawkins";
  const body = input.body.trim();
  const recipients = await loadRecipients(input.audience, input.contactIds);

  if (recipients.length === 0) {
    throw new Error("No customers match this message's audience.");
  }

  const { data: messageRow, error: insertError } = await supabaseAdmin
    .from("customer_messages")
    .insert({
      subject: input.channels.includes("email") ? subject : null,
      body,
      channels: input.channels,
      audience: input.audience,
      recipient_count: recipients.length,
      created_by: input.createdBy,
    })
    .select("id")
    .single();
  if (insertError) throw insertError;
  const messageId = messageRow.id as string;

  logInfo("Customer message send started", { messageId, recipients: recipients.length, channels: input.channels });

  const smsPhones = input.channels.includes("sms")
    ? [...new Set(recipients.filter((contact) => !contact.sms_opt_out).map((contact) => contact.phone))]
    : [];
  const emailAddresses = input.channels.includes("email")
    ? [...new Set(recipients.filter((contact) => contact.email && !contact.email_opt_out).map((contact) => contact.email as string))]
    : [];

  const [smsResults, emailResults] = await Promise.all([
    smsPhones.length ? sendBulkSms({ phones: smsPhones, message: body }) : Promise.resolve(new Map()),
    emailAddresses.length ? sendEmails(emailAddresses, subject, body) : Promise.resolve(new Map()),
  ]);

  const sms = { sent: 0, failed: 0, skipped: 0 };
  const email = { sent: 0, failed: 0, skipped: 0 };
  const recipientRows = recipients.map((contact) => {
    let smsStatus: DeliveryStatus | null = null;
    let smsProviderStatus: string | null = null;
    let smsMessageId: string | null = null;
    if (input.channels.includes("sms")) {
      const result = contact.sms_opt_out ? undefined : smsResults.get(contact.phone);
      smsStatus = !result ? "skipped" : result.success ? "sent" : "failed";
      smsProviderStatus = contact.sms_opt_out ? "opted_out" : result?.status ?? null;
      smsMessageId = result?.messageId ?? null;
      sms[smsStatus] += 1;
    }

    let emailStatus: DeliveryStatus | null = null;
    let emailMessageId: string | null = null;
    if (input.channels.includes("email")) {
      const result = contact.email && !contact.email_opt_out ? emailResults.get(contact.email) : undefined;
      const status: DeliveryStatus = result?.status ?? "skipped";
      emailStatus = status;
      emailMessageId = result?.id ?? null;
      email[status] += 1;
    }

    return {
      message_id: messageId,
      contact_id: contact.id,
      phone: contact.phone,
      email: contact.email,
      sms_status: smsStatus,
      sms_provider_status: smsProviderStatus,
      sms_message_id: smsMessageId,
      email_status: emailStatus,
      email_message_id: emailMessageId,
    };
  });

  for (let index = 0; index < recipientRows.length; index += INSERT_CHUNK_SIZE) {
    const { error } = await supabaseAdmin
      .from("customer_message_recipients")
      .insert(recipientRows.slice(index, index + INSERT_CHUNK_SIZE));
    if (error) logError("Customer message recipient log insert failed", { messageId, error: error.message });
  }

  const delivered = sms.sent + email.sent;
  const failed = sms.failed + email.failed;
  const status = delivered === 0 ? "failed" : failed > 0 ? "partial" : "sent";

  const { error: updateError } = await supabaseAdmin
    .from("customer_messages")
    .update({
      status,
      sms_sent: sms.sent,
      sms_failed: sms.failed,
      sms_skipped: sms.skipped,
      email_sent: email.sent,
      email_failed: email.failed,
      email_skipped: email.skipped,
      completed_at: new Date().toISOString(),
    })
    .eq("id", messageId);
  if (updateError) logError("Customer message summary update failed", { messageId, error: updateError.message });

  logInfo("Customer message send finished", { messageId, status, sms, email });
  return { messageId, status, recipientCount: recipients.length, sms, email };
}

export async function listCustomerMessages(limit = 20) {
  const { data, error } = await supabaseAdmin
    .from("customer_messages")
    .select("id, subject, body, channels, audience, recipient_count, sms_sent, sms_failed, sms_skipped, email_sent, email_failed, email_skipped, status, created_at, completed_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
