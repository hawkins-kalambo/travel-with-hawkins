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
    { id: "menu_mybookings", title: t(language, "menuMyBookings") },
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

// A Confirm / Cancel prompt whose body is supplied in full (no fixed prefix).
export function confirmPromptMessage(language: WhatsAppLanguage, body: string): WhatsAppOutboundMessage {
  return {
    type: "buttons", body,
    buttons: [{ id: "flow_confirm", title: t(language, "confirmed") }, { id: "flow_cancel", title: t(language, "cancel") }],
    fallback: `${body}\n1. ${t(language, "confirmed")}\n2. ${t(language, "cancel")}`,
  };
}

export function passengerForMessage(language: WhatsAppLanguage): WhatsAppOutboundMessage {
  return {
    type: "buttons", body: t(language, "askPassengerFor"),
    buttons: [
      { id: "booking_self", title: t(language, "passengerSelf") },
      { id: "booking_other", title: t(language, "passengerOther") },
    ],
    fallback: `${t(language, "askPassengerFor")}\n1. ${t(language, "passengerSelf")}\n2. ${t(language, "passengerOther")}`,
  };
}

export type BookingListItem = { bookingId: string; routeLabel: string; travelDate: string; statusLabel: string };

export function bookingsListMessage(language: WhatsAppLanguage, items: BookingListItem[]): WhatsAppOutboundMessage {
  const rows = items.slice(0, 10).map((item) => ({
    id: `bk:${item.bookingId}`,
    title: item.routeLabel.slice(0, 24),
    description: `${item.travelDate} • ${item.statusLabel}`.slice(0, 72),
  }));
  const body = t(language, "myBookingsHeader");
  return {
    type: "list", body, button: t(language, "myBookingsButton"), rows,
    fallback: `${body}\n${items.map((item, index) => `${index + 1}. ${item.routeLabel}, ${item.travelDate} (${item.statusLabel})`).join("\n")}`,
  };
}

export type BookableRouteItem = { routeId: string; label: string; fareLabel: string };

// Route picker shown when there are no scheduled departures: the customer picks
// a supported route and is then asked for a preferred travel date.
export function routesListMessage(language: WhatsAppLanguage, routes: BookableRouteItem[]): WhatsAppOutboundMessage {
  const rows = routes.slice(0, 10).map((route) => ({
    id: `route:${route.routeId}`,
    title: route.label.slice(0, 24),
    description: route.fareLabel.slice(0, 72),
  }));
  const body = t(language, "askRoute");
  return {
    type: "list", body, button: t(language, "routesButton"), rows,
    fallback: `${body}\n${routes.map((route, index) => `${index + 1}. ${route.label} (${route.fareLabel})`).join("\n")}`,
  };
}

export function bookingActionMessage(language: WhatsAppLanguage, body: string): WhatsAppOutboundMessage {
  return {
    type: "buttons", body,
    buttons: [
      { id: "bk_pay", title: t(language, "payFee") },
      { id: "bk_cancel", title: t(language, "cancelBooking") },
    ],
    fallback: `${body}\n1. ${t(language, "payFee")}\n2. ${t(language, "cancelBooking")}\n(menu to go back)`,
  };
}

export function messageText(message: WhatsAppOutboundMessage): string {
  if (message.type === "text") return message.text;
  if (message.type === "template") return `[template:${message.name}]`;
  if (message.type === "document") return message.caption ? `[document: ${message.filename}] ${message.caption}` : `[document: ${message.filename}]`;
  if (message.type === "image") return message.caption ? `[image] ${message.caption}` : "[image]";
  return message.fallback;
}
