export type WhatsAppLanguage = "en" | "ny";
export type WhatsAppConversationMode = "bot" | "human";
export type WhatsAppConversationStatus = "bot_controlled" | "waiting" | "human_controlled" | "resolved";

export type WhatsAppActionId =
  | "lang_en"
  | "lang_ny"
  | "menu_routes"
  | "menu_booking"
  | "menu_payment"
  | "menu_tracking"
  | "menu_question"
  | "menu_agent"
  | "menu_language"
  | "flow_confirm"
  | "flow_cancel"
  | "flow_back";

// `accountId` (the WhatsApp Business Account ID, from `entry[].id`) and
// `phoneNumberId` (the business phone number ID, from `value.metadata`) are
// populated by the parser and checked against server-side configuration
// before an event is persisted or processed. They are intentionally absent
// from the stored/rehydrated event shape (see `toStoredEventData`), so they
// remain optional on the type.
export type WhatsAppInboundMessage = {
  kind: "message";
  id: string;
  from: string;
  timestamp?: string;
  displayName?: string;
  inputType: "text" | "button" | "list" | "unknown";
  text: string;
  actionId?: string;
  accountId?: string;
  phoneNumberId?: string;
};

export type WhatsAppStatusEvent = {
  kind: "status";
  id: string;
  status: "sent" | "delivered" | "read" | "failed" | "deleted" | string;
  timestamp?: string;
  recipientId?: string;
  errorCode?: string;
  accountId?: string;
  phoneNumberId?: string;
};

export type WhatsAppParsedEvent = WhatsAppInboundMessage | WhatsAppStatusEvent;

export type WhatsAppButton = { id: WhatsAppActionId | string; title: string };
export type WhatsAppListRow = { id: WhatsAppActionId | string; title: string; description?: string };

export type WhatsAppOutboundMessage =
  | { type: "text"; text: string }
  | { type: "buttons"; body: string; buttons: WhatsAppButton[]; fallback: string }
  | { type: "list"; body: string; button: string; rows: WhatsAppListRow[]; fallback: string }
  | { type: "template"; name: string; languageCode: string; parameters?: string[] };

export type WhatsAppConversationStep =
  | "language"
  | "menu"
  | "route_origin"
  | "route_destination"
  | "booking_departure"
  | "booking_name"
  | "booking_email"
  | "booking_student_id"
  | "booking_seats"
  | "booking_confirm"
  | "payment_booking_id"
  | "tracking_booking_id"
  | "question"
  | "agent_waiting";

export type BookingDraft = {
  departureId?: string;
  routeId?: string;
  routeLabel?: string;
  travelDate?: string;
  pickup?: string;
  name?: string;
  email?: string;
  studentId?: string;
  seats?: number;
};

export type WhatsAppStateData = {
  origin?: string;
  booking?: BookingDraft;
  trackingFailures?: number;
};

export type WhatsAppConversationState = {
  conversationId: string;
  contactId: string;
  waId: string;
  language: WhatsAppLanguage;
  mode: WhatsAppConversationMode;
  status: WhatsAppConversationStatus;
  step: WhatsAppConversationStep;
  data: WhatsAppStateData;
  version: number;
  serviceWindowExpiresAt?: string | null;
};
