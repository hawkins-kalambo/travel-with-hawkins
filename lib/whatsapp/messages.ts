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

// "You have a booking in progress — discard it?" Confirm discards; Keep going
// resumes the draft (mapped to the flow_back action so it reads as "back").
export function discardConfirmMessage(language: WhatsAppLanguage): WhatsAppOutboundMessage {
  const body = t(language, "draftDiscardPrompt");
  return {
    type: "buttons", body,
    buttons: [
      { id: "flow_confirm", title: t(language, "confirmed") },
      { id: "flow_back", title: t(language, "keepGoing") },
    ],
    fallback: `${body}\n1. ${t(language, "confirmed")}\n2. ${t(language, "keepGoing")}`,
  };
}

// Review screen: Confirm / Edit / Cancel. Edit maps to flow_back so the
// customer steps back through the captured fields to change one.
export function reviewConfirmMessage(language: WhatsAppLanguage, summary: string): WhatsAppOutboundMessage {
  return {
    type: "buttons", body: summary,
    buttons: [
      { id: "flow_confirm", title: t(language, "confirmed") },
      { id: "flow_back", title: t(language, "editButton") },
      { id: "flow_cancel", title: t(language, "cancel") },
    ],
    fallback: `${summary}\n1. ${t(language, "confirmed")}\n2. ${t(language, "editButton")}\n3. ${t(language, "cancel")}`,
  };
}

// A resolved route: its real details, then Continue booking / Change route /
// Main menu. Continue booking carries straight on — it never sends the
// customer back to the menu to start over (§7).
export function routeSelectedMessage(language: WhatsAppLanguage, summary: string): WhatsAppOutboundMessage {
  return {
    type: "buttons", body: summary,
    buttons: [
      { id: "flow_confirm", title: t(language, "continueBooking") },
      { id: "route_change", title: t(language, "changeRoute") },
      { id: "route_menu", title: t(language, "routeOptMenu") },
    ],
    fallback: `${summary}\n1. ${t(language, "continueBooking")}\n2. ${t(language, "changeRoute")}\n3. ${t(language, "routeOptMenu")}`,
  };
}

// Review screen with granular edit targets (§9). A list so all the actions fit.
export function reviewActionsMessage(language: WhatsAppLanguage, summary: string): WhatsAppOutboundMessage {
  const rows = [
    { id: "flow_confirm", title: t(language, "confirmed") },
    { id: "edit_route", title: t(language, "editRoute") },
    { id: "edit_date", title: t(language, "editDate") },
    { id: "edit_passenger", title: t(language, "editPassenger") },
    { id: "flow_cancel", title: t(language, "cancel") },
  ];
  return {
    type: "list", body: summary, button: t(language, "editButton"), rows,
    fallback: `${summary}\n${rows.map((r, i) => `${i + 1}. ${r.title}`).join("\n")}`,
  };
}

// Offered after a weaker AI answer — not after every reply (§24).
export function feedbackPromptMessage(language: WhatsAppLanguage): WhatsAppOutboundMessage {
  const body = t(language, "feedbackPrompt");
  return {
    type: "buttons", body,
    buttons: [
      { id: "ai_helpful", title: t(language, "feedbackYes") },
      { id: "ai_needs_help", title: t(language, "feedbackMore") },
    ],
    fallback: `${body}\n1. ${t(language, "feedbackYes")}\n2. ${t(language, "feedbackMore")}`,
  };
}

// Raised a support request but the bot still serves the customer (§14).
export function agentWaitingMessage(language: WhatsAppLanguage): WhatsAppOutboundMessage {
  const rows = [
    { id: "menu_booking", title: t(language, "menuBooking") },
    { id: "menu_mybookings", title: t(language, "menuMyBookings") },
    { id: "menu_payment", title: t(language, "menuPayment") },
    { id: "route_menu", title: t(language, "routeOptMenu") },
    { id: "cancel_agent", title: t(language, "cancelAgentRequest") },
  ];
  return {
    type: "list", body: t(language, "agentWaitingPrompt"), button: t(language, "routeEntryButton"), rows,
    fallback: `${t(language, "agentWaitingPrompt")}\n${rows.map((r, i) => `${i + 1}. ${r.title}`).join("\n")}`,
  };
}

// After a booking is held: what next? (§10)
export function bookingDoneMessage(language: WhatsAppLanguage): WhatsAppOutboundMessage {
  const rows = [
    { id: "menu_booking", title: t(language, "bookNextPassenger") },
    { id: "menu_mybookings", title: t(language, "menuMyBookings") },
    { id: "menu_payment", title: t(language, "menuPayment") },
    { id: "route_menu", title: t(language, "routeOptMenu") },
  ];
  return {
    type: "list", body: t(language, "bookingDonePrompt"), button: t(language, "routeEntryButton"), rows,
    fallback: `${t(language, "bookingDonePrompt")}\n${rows.map((r, i) => `${i + 1}. ${r.title}`).join("\n")}`,
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

// WhatsApp lists cap at 10 rows. When the customer owns more, show a page of 9
// plus a "Show more" row that advances the offset.
export function bookingsListMessage(
  language: WhatsAppLanguage, items: BookingListItem[], offset = 0,
): WhatsAppOutboundMessage {
  const start = Math.max(0, offset);
  const hasMore = items.length > start + 10;
  const page = items.slice(start, start + (hasMore ? 9 : 10));
  const rows = page.map((item) => ({
    id: `bk:${item.bookingId}`,
    title: item.routeLabel.slice(0, 24),
    description: `${item.travelDate} • ${item.statusLabel}`.slice(0, 72),
  }));
  if (hasMore) rows.push({ id: "bk:more", title: t(language, "showMore"), description: `${items.length - (start + 9)} more` });
  const body = t(language, "myBookingsHeader");
  return {
    type: "list", body, button: t(language, "myBookingsButton"), rows,
    fallback: `${body}\n${items.map((item, index) => `${index + 1}. ${item.routeLabel}, ${item.travelDate} (${item.statusLabel})`).join("\n")}`,
  };
}

// `label` is the compact row title (university short code where applicable);
// `subtitle` carries the fuller name / pickup as supporting text.
export type BookableRouteItem = { routeId: string; label: string; fareLabel: string; subtitle?: string };

function routeRowDescription(item: BookableRouteItem): string {
  return [item.fareLabel, item.subtitle].filter(Boolean).join(" · ").slice(0, 72);
}

// Route picker shown when there are no scheduled departures: the customer picks
// a supported route and is then asked for a preferred travel date.
export function routesListMessage(language: WhatsAppLanguage, routes: BookableRouteItem[]): WhatsAppOutboundMessage {
  const rows = routes.slice(0, 10).map((route) => ({
    id: `route:${route.routeId}`,
    title: route.label.slice(0, 24),
    description: routeRowDescription(route),
  }));
  const body = t(language, "askRoute");
  return {
    type: "list", body, button: t(language, "routesButton"), rows,
    fallback: `${body}\n${routes.map((route, index) => `${index + 1}. ${route.label} (${route.fareLabel})`).join("\n")}`,
  };
}

// "Find a Route" entry: Popular Routes / Student Travel / Other Travel / Main
// Menu. The customer can also just type a route ("Lilongwe to Mzuzu").
export function routeEntryMessage(language: WhatsAppLanguage): WhatsAppOutboundMessage {
  const rows = [
    { id: "route_popular", title: t(language, "routeOptPopular") },
    { id: "route_student", title: t(language, "routeOptStudent") },
    { id: "route_other", title: t(language, "routeOptOther") },
    { id: "route_menu", title: t(language, "routeOptMenu") },
  ];
  return {
    type: "list", body: t(language, "routeEntryIntro"), button: t(language, "routeEntryButton"), rows,
    fallback: `${t(language, "routeEntryIntro")}\n${rows.map((row, i) => `${i + 1}. ${row.title}`).join("\n")}`,
  };
}

// One-location clarifier: "Is {place} where you are travelling from or to?"
export function routeClarifyMessage(language: WhatsAppLanguage, place: string): WhatsAppOutboundMessage {
  const body = t(language, "routeClarifyPrompt", { place });
  return {
    type: "buttons", body,
    buttons: [
      { id: "route_from", title: t(language, "routeClarifyFrom") },
      { id: "route_to", title: t(language, "routeClarifyTo") },
      { id: "route_restart", title: t(language, "routeClarifyRestart") },
    ],
    fallback: `${body}\n1. ${t(language, "routeClarifyFrom")} ${place}\n2. ${t(language, "routeClarifyTo")} ${place}\n3. ${t(language, "routeClarifyRestart")}`,
  };
}

export function studentDirectionMessage(language: WhatsAppLanguage): WhatsAppOutboundMessage {
  const body = t(language, "routeStudentDirectionPrompt");
  return {
    type: "buttons", body,
    buttons: [
      { id: "route_dir_to", title: t(language, "routeDirToUni") },
      { id: "route_dir_from", title: t(language, "routeDirFromUni") },
    ],
    fallback: `${body}\n1. ${t(language, "routeDirToUni")}\n2. ${t(language, "routeDirFromUni")}`,
  };
}

// The short code (MZUNI) is the row title; the full university name is the
// supporting line. Falls back to the full name as the title when a university
// has no short code (schema makes that impossible today, but stay safe).
export type UniversityChoice = { id: string; name: string; shortCode?: string | null };

export function universityListMessage(language: WhatsAppLanguage, universities: UniversityChoice[]): WhatsAppOutboundMessage {
  const rows = universities.slice(0, 10).map((u) => ({
    id: `uni:${u.id}`,
    title: (u.shortCode || u.name).slice(0, 24),
    description: u.shortCode ? u.name.slice(0, 72) : undefined,
  }));
  const body = t(language, "routeStudentPickUniversity");
  return {
    type: "list", body, button: t(language, "routeStudentUniversityButton"), rows,
    fallback: `${body}\n${universities.map((u, i) => `${i + 1}. ${u.shortCode ? `${u.shortCode} — ${u.name}` : u.name}`).join("\n")}`,
  };
}

// WhatsApp lists cap at 10 rows. Page the popular routes 8 at a time, keeping
// two slots for "Previous routes" / "More routes" navigation.
export const POPULAR_PAGE_SIZE = 8;

export function popularRoutesMessage(
  language: WhatsAppLanguage, routes: BookableRouteItem[], offset = 0,
): WhatsAppOutboundMessage {
  const start = Math.min(Math.max(0, offset), Math.max(0, routes.length - 1));
  const page = routes.slice(start, start + POPULAR_PAGE_SIZE);
  const rows: { id: string; title: string; description?: string }[] = [];
  if (start > 0) rows.push({ id: "route_popular_prev", title: t(language, "routePrevRoutes") });
  for (const route of page) {
    rows.push({ id: `route:${route.routeId}`, title: route.label.slice(0, 24), description: routeRowDescription(route) });
  }
  if (start + POPULAR_PAGE_SIZE < routes.length) {
    rows.push({ id: "route_popular_more", title: t(language, "routeMoreRoutes"), description: `${routes.length - (start + POPULAR_PAGE_SIZE)} more` });
  }
  const body = t(language, "routePopularHeader");
  return {
    type: "list", body, button: t(language, "routesButton"), rows,
    fallback: `${body}\n${routes.map((route, i) => `${i + 1}. ${route.label} (${route.fareLabel})`).join("\n")}`,
  };
}

// "We could not find that route" — offer to log it, or step sideways.
export function routeRequestMessage(language: WhatsAppLanguage, origin: string, destination: string): WhatsAppOutboundMessage {
  const body = t(language, "routeNotFoundPrompt", { origin, destination });
  const rows = [
    { id: "route_req_submit", title: t(language, "routeReqSubmit") },
    { id: "route_popular", title: t(language, "routeOptPopular") },
    { id: "menu_agent", title: t(language, "menuAgent") },
    { id: "route_menu", title: t(language, "routeOptMenu") },
  ];
  return {
    type: "list", body, button: t(language, "routeEntryButton"), rows,
    fallback: `${body}\n${rows.map((row, i) => `${i + 1}. ${row.title}`).join("\n")}`,
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
