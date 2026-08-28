import type { DeterministicIntent } from "@/lib/whatsapp/intent";
import type { WhatsAppConversationStep } from "@/lib/whatsapp/types";

export type StateMachineCommand =
  | { kind: "none" }
  | { kind: "menu"; nextStep: "menu" }
  | { kind: "cancel"; nextStep: "menu" }
  | { kind: "restart"; nextStep: "menu" }
  | { kind: "back"; nextStep: WhatsAppConversationStep }
  | { kind: "handoff"; nextStep: "agent_waiting" };

const BACK: Partial<Record<WhatsAppConversationStep, WhatsAppConversationStep>> = {
  route_destination: "route_origin", booking_departure: "route_origin",
  booking_passenger_for: "booking_departure", booking_name: "booking_passenger_for",
  booking_email: "booking_name", booking_student_id: "booking_email",
  booking_review: "booking_student_id", payment_booking_id: "menu",
  tracking_booking_id: "menu", my_bookings: "menu", booking_action: "my_bookings",
  cancel_confirm: "booking_action", question: "menu",
};

export function reduceGlobalCommand(step: WhatsAppConversationStep, intent: DeterministicIntent): StateMachineCommand {
  if (intent === "menu") return { kind: "menu", nextStep: "menu" };
  if (intent === "cancel") return { kind: "cancel", nextStep: "menu" };
  if (intent === "restart") return { kind: "restart", nextStep: "menu" };
  if (intent === "agent") return { kind: "handoff", nextStep: "agent_waiting" };
  if (intent === "back") return { kind: "back", nextStep: BACK[step] || "menu" };
  return { kind: "none" };
}
