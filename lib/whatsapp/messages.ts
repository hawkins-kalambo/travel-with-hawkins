import { t } from "@/lib/whatsapp/i18n";
import type { WhatsAppLanguage, WhatsAppOutboundMessage } from "@/lib/whatsapp/types";

export function languageMessage(): WhatsAppOutboundMessage {
  return {
    type: "buttons",
    body: t("en", "welcome"),
    buttons: [{ id: "lang_en", title: "English" }, { id: "lang_ny", title: "Chichewa" }],
    fallback: `${t("en", "welcome")}\n1. English\n2. Chichewa`,
  };
}

export function mainMenuMessage(language: WhatsAppLanguage): WhatsAppOutboundMessage {
  const rows = [
    { id: "menu_routes", title: t(language, "menuRoutes") },
    { id: "menu_booking", title: t(language, "menuBooking") },
    { id: "menu_payment", title: t(language, "menuPayment") },
    { id: "menu_tracking", title: t(language, "menuTracking") },
    { id: "menu_question", title: t(language, "menuQuestion") },
    { id: "menu_agent", title: t(language, "menuAgent") },
    { id: "menu_language", title: t(language, "menuLanguage") },
  ];
  return {
    type: "list", body: t(language, "mainMenu"), button: "Menu", rows,
    fallback: `${t(language, "mainMenu")}\n${rows.map((row, index) => `${index + 1}. ${row.title}`).join("\n")}`,
  };
}

export function confirmationMessage(language: WhatsAppLanguage, summary: string): WhatsAppOutboundMessage {
  return {
    type: "buttons", body: `${t(language, "confirmBooking")}\n${summary}`,
    buttons: [{ id: "flow_confirm", title: t(language, "confirmed") }, { id: "flow_cancel", title: t(language, "cancel") }],
    fallback: `${t(language, "confirmBooking")}\n${summary}\n1. ${t(language, "confirmed")}\n2. ${t(language, "cancel")}`,
  };
}

export function messageText(message: WhatsAppOutboundMessage): string {
  if (message.type === "text") return message.text;
  if (message.type === "template") return `[template:${message.name}]`;
  return message.fallback;
}
