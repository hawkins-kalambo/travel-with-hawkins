import "server-only";

import { sendEmail } from "@/lib/resend";
import { sendAdminHandoffAlertSms } from "@/lib/africasTalking";
import { logError } from "@/lib/logger";
import { getContactDetails } from "@/lib/websiteChat/repository";

function conversationUrl(conversationId: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://travelwithhawkins.com";
  return `${appUrl.replace(/\/$/, "")}/communication/conversations/${conversationId}`;
}

// Fired exactly once, the moment a website-chat conversation is handed off
// to a human (see the wantsHuman() branch in respond.ts) -- never on every
// routine bot-answered message, so this can't turn into a flood of alerts.
// Both channels fail soft (log and continue) so a missing/misconfigured
// provider never blocks the customer-facing handoff itself.
export async function notifyAdminOfHandoff(
  conversationId: string,
  contactId: string,
  fallbackName: string
): Promise<void> {
  const contact = await getContactDetails(contactId);
  const name = contact?.name || fallbackName;
  const url = conversationUrl(conversationId);

  await sendAdminHandoffAlertSms({ customerName: name, conversationUrl: url }).catch((error) => {
    logError("Admin handoff alert SMS threw", { error: error instanceof Error ? error.message : String(error) });
  });

  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!adminEmail) return;

  const identity = contact?.customerId ? "Logged-in customer (account linked)" : "Guest visitor (no account)";

  const result = await sendEmail({
    to: adminEmail,
    subject: `🔔 Live chat needs a human agent — ${name}`,
    html: `
      <div style="font-family:Arial;padding:16px">
        <h2>A live chat visitor needs a human agent</h2>
        <p><b>Name:</b> ${name}</p>
        <p><b>Type:</b> ${identity}</p>
        ${contact?.phone ? `<p><b>Phone:</b> ${contact.phone}</p>` : ""}
        ${contact?.email ? `<p><b>Email:</b> ${contact.email}</p>` : ""}
        <p><a href="${url}">Open the conversation</a></p>
      </div>
    `,
  }).catch((error) => ({ success: false as const, error }));

  if (!result.success) {
    logError("Admin handoff alert email failed", { error: result.error });
  }
}
