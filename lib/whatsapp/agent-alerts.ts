import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmail } from "@/lib/resend";
import { sendAdminHandoffAlertSms } from "@/lib/africasTalking";
import { logError } from "@/lib/logger";
import { maskWhatsAppId } from "@/lib/whatsapp/phone";
import type { WhatsAppConversationState } from "@/lib/whatsapp/types";

// forceLogin=1 (see proxy.ts) makes the link demand a fresh password even on an
// already-signed-in device — it travels through SMS/email, so an unlocked phone
// in the wrong hands shouldn't drop straight into the admin panel.
function inboxUrl(conversationId: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://travelwithhawkins.com";
  return `${appUrl.replace(/\/$/, "")}/admin/communication?tab=whatsapp&conversation=${conversationId}&forceLogin=1`;
}

// Fired exactly once when a WhatsApp conversation is handed to a human — the
// customer typed "agent", chose "Talk to an Agent", or a booking action needs
// an agent. NOT on every message and NOT when an agent already holds the
// conversation (see the guard in requestHuman). Both channels fail soft so a
// missing/misconfigured provider never blocks the customer-facing handoff.
export async function notifyAdminOfWhatsAppHandoff(conversation: WhatsAppConversationState): Promise<void> {
  const url = inboxUrl(conversation.conversationId);

  let displayName: string | undefined;
  try {
    const contact = await supabaseAdmin.from("whatsapp_contacts")
      .select("display_name").eq("id", conversation.contactId).maybeSingle();
    displayName = contact.data?.display_name?.trim() || undefined;
  } catch { /* fall back to the masked number below */ }
  const masked = conversation.waId ? maskWhatsAppId(conversation.waId) : "unknown number";

  await sendAdminHandoffAlertSms({
    customerName: displayName, conversationUrl: url, channel: "WhatsApp",
  }).catch((error) => {
    logError("WhatsApp handoff alert SMS threw", { error: error instanceof Error ? error.message : String(error) });
  });

  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!adminEmail) return;
  const result = await sendEmail({
    to: adminEmail,
    subject: `🔔 WhatsApp chat needs a human agent${displayName ? ` — ${displayName}` : ""}`,
    html: `
      <div style="font-family:Arial;padding:16px">
        <h2>A WhatsApp customer needs a human agent</h2>
        ${displayName ? `<p><b>Name:</b> ${displayName}</p>` : ""}
        <p><b>Number:</b> ${masked}</p>
        <p><a href="${url}">Open the conversation</a></p>
      </div>
    `,
  }).catch((error) => ({ success: false as const, error }));
  if (!result.success) {
    logError("WhatsApp handoff alert email failed", { error: (result as { error: unknown }).error });
  }
}
