import "server-only";

import { after } from "next/server";
import { createHash } from "node:crypto";
import { isRateLimited } from "@/lib/rateLimit";
import { logError, logInfo, logWarn } from "@/lib/logger";
import { markWhatsAppMessageRead } from "@/lib/whatsapp/client";
import { getWhatsAppAiProvider } from "@/lib/whatsapp/ai-provider";
import { cancelWhatsAppBooking, createUnassignedWhatsAppBooking, createWhatsAppBooking, findAvailableDepartures, getBookingFeeAmount, getOrCreateBookingFeeCheckout, listBookableRoutes, listWhatsAppBookings, loadBookableRoute, loadDeparture, loadWhatsAppBooking, trackBookingForWhatsApp, type AvailableDeparture } from "@/lib/whatsapp/domain";
import { UNPAID_RESERVATION_LIMIT, formatMalawiDateTime } from "@/lib/whatsapp/booking-rules";
import { parseFutureTravelDate } from "@/lib/bookingLifecycle";
import { answerFromApprovedKnowledge } from "@/lib/whatsapp/knowledge";
import { detectIntent, languageFromInput } from "@/lib/whatsapp/intent";
import { t } from "@/lib/whatsapp/i18n";
import { bookingActionMessage, bookingsListMessage, confirmPromptMessage, languageMessage, mainMenuMessage, passengerForMessage, routesListMessage } from "@/lib/whatsapp/messages";
import { claimWebhookEvent, deliverAndRecord, ensureConversation, failWebhookEvent, finishWebhookEvent, recordInbound, requestHuman, setLanguage, setOptOut, transitionState, updateDeliveryStatus } from "@/lib/whatsapp/repository";
import { reduceGlobalCommand } from "@/lib/whatsapp/state-machine";
import type { BookingDraft, WhatsAppConversationState, WhatsAppInboundMessage, WhatsAppOutboundMessage } from "@/lib/whatsapp/types";

function textMessage(text: string): WhatsAppOutboundMessage { return { type: "text", text }; }
function hashRateKey(waId: string): string { return createHash("sha256").update(waId).digest("hex").slice(0, 24); }
function clean(value: string, max = 120): string { return value.replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max); }
function validName(value: string): boolean { return value.length >= 2 && /^[\p{L}\p{M}][\p{L}\p{M}\s.'’-]*$/u.test(value); }
function validEmail(value: string): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }

function promptForStep(conversation: WhatsAppConversationState): string {
  const keys = {
    route_origin: "askOrigin", route_pick: "askRoute", route_date: "askTravelDate",
    booking_departure: "askDestination",
    booking_passenger_for: "askPassengerFor", booking_name: "askName",
    booking_email: "askEmail", booking_student_id: "askStudentId",
    payment_booking_id: "askBookingIdPayment", tracking_booking_id: "askBookingIdTracking", question: "askQuestion",
  } as const;
  const key = keys[conversation.step as keyof typeof keys];
  return key ? t(conversation.language, key) : t(conversation.language, "mainMenu");
}

function isAffirmative(message: WhatsAppInboundMessage): boolean {
  return message.actionId === "flow_confirm"
    || ["confirm", "yes", "tsimikizani", "eya", "inde", "1"].includes(message.text.trim().toLowerCase());
}

function bookingRejectionKey(reason: string): "unpaidLimitReached" | "departureTooSoon" | "seatsUnavailable" | "routeUnpriced" | "bookingFailed" {
  if (reason === "unpaid_limit_reached") return "unpaidLimitReached";
  if (reason === "departure_too_soon") return "departureTooSoon";
  if (reason === "route_unpriced") return "routeUnpriced";
  if (reason === "insufficient_seats" || reason === "departure_unavailable" || reason === "route_unavailable") return "seatsUnavailable";
  return "bookingFailed";
}

async function send(conversation: WhatsAppConversationState, message: WhatsAppOutboundMessage): Promise<void> {
  await deliverAndRecord(conversation, message);
}

async function goToMenu(conversation: WhatsAppConversationState, prefix?: string): Promise<WhatsAppConversationState> {
  const next = await transitionState(conversation, "menu", {});
  if (prefix) await send(next, textMessage(prefix));
  await send(next, mainMenuMessage(next.language));
  return next;
}

// Route/departure reads hit external tables and can fail (missing schema,
// PostgREST relationship errors, timeouts). A failure here must never bubble
// out of handleMessage as an unhandled throw — that would leave the customer
// in silence and the conversation pinned to a step whose handler always
// re-throws. On failure returns `{ ok: false }`; callers then route the
// customer back to the menu with an explanation. `ok: true` still carries a
// possibly-empty / null value (a legitimate "nothing found").
async function tryRouteLookup<T>(conversation: WhatsAppConversationState, run: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    logError("WhatsApp route lookup failed", {
      conversationId: conversation.conversationId,
      code: error instanceof Error ? error.message.slice(0, 120) : "unknown",
    });
    return { ok: false };
  }
}

function departureRows(departures: AvailableDeparture[]) {
  return departures.map((departure) => ({
    id: `departure:${departure.id}`,
    title: departure.routeLabel,
    description: `${departure.travelDate}${departure.departureTime ? ` ${departure.departureTime.slice(0, 5)}` : ""} • MWK ${departure.fare.toLocaleString("en-MW")} • ${departure.availableSeats} seats`,
  }));
}

async function startRouteSearch(conversation: WhatsAppConversationState, booking: boolean): Promise<void> {
  const next = await transitionState(conversation, "route_origin", booking ? { booking: {} } : {});
  await send(next, textMessage(t(next.language, "askOrigin")));
}

// Only reached at step "question", so deterministic menu/button handling and
// active booking steps have already had priority, and human-controlled
// conversations returned earlier (mode === "human") — the AI never sees those.
// AI output only picks which existing prompt to show; it never books, pays,
// or changes state. Any failure falls back to a prompt, never silence.
async function answerQuestion(conversation: WhatsAppConversationState, question: string): Promise<void> {
  const known = answerFromApprovedKnowledge(question);
  if (known.outcome === "answered") { await send(conversation, textMessage(known.text)); return; }
  // "unsafe" (prompt injection) is a hard stop — never forwarded to the model.
  if (known.outcome === "unsafe") {
    await send(conversation, textMessage(t(conversation.language, "unrelatedQuestion"))); return;
  }

  // "unknown" or "unrelated": the keyword matcher couldn't place it — ask the
  // model to interpret. With AI off, fall back to the blunt safe response.
  const provider = getWhatsAppAiProvider();
  if (!provider) {
    await send(conversation, textMessage(t(conversation.language, known.outcome === "unrelated" ? "unrelatedQuestion" : "aiUnavailable"))); return;
  }

  const ai = await provider.interpret(question, conversation.language);
  if (ai.answer) { await send(conversation, textMessage(ai.answer)); return; }
  if (ai.clarify || ai.intent === "unknown" || ai.intent === "question" || ai.intent === "menu") {
    await send(conversation, textMessage(t(conversation.language, "aiClarify"))); return;
  }
  if (ai.intent === "routes" || ai.intent === "booking") {
    const where = ai.origin && ai.destination ? ` from ${ai.origin} to ${ai.destination}`
      : ai.origin ? ` from ${ai.origin}` : "";
    await send(conversation, textMessage(t(conversation.language, "aiRouteHint", { where }))); return;
  }
  if (ai.intent === "tracking") { await send(conversation, textMessage(t(conversation.language, "askBookingIdTracking"))); return; }
  if (ai.intent === "payment") { await send(conversation, textMessage(t(conversation.language, "askBookingIdPayment"))); return; }
  await send(conversation, textMessage(t(conversation.language, "aiUnavailable")));
}

async function handleMessage(conversationInput: WhatsAppConversationState & { optedOut: boolean }, message: WhatsAppInboundMessage): Promise<void> {
  let conversation: WhatsAppConversationState = conversationInput;
  const intent = detectIntent(message.text, message.actionId);

  if (intent === "opt_in") {
    await setOptOut(conversation, false);
    await send(conversation, textMessage(t(conversation.language, "optedIn")));
    await goToMenu(conversation); return;
  }
  if (intent === "opt_out") {
    await setOptOut(conversation, true);
    await send(conversation, textMessage(t(conversation.language, "optedOut"))); return;
  }
  if (conversationInput.optedOut) return;
  if (conversation.mode === "human") return;

  // Expired mid-flow session: drop the stale flow and re-read this message
  // at the menu. Chat history, language, bookings and payments are untouched;
  // only the transient step + state_data are cleared. Uses the version-aware
  // transition so an older in-flight message cannot resurrect the old step.
  const midFlow = conversation.step !== "menu" && conversation.step !== "language";
  if (midFlow && conversation.stateExpiresAt != null && Date.parse(conversation.stateExpiresAt) < Date.now()) {
    conversation = await transitionState(conversation, "menu", {});
  }

  const globalCommand = reduceGlobalCommand(conversation.step, intent);
  if (globalCommand.kind === "handoff") {
    conversation = await requestHuman(conversation);
    await send(conversation, textMessage(t(conversation.language, "agentWaiting"))); return;
  }
  if (globalCommand.kind === "restart") { await goToMenu(conversation, t(conversation.language, "restarted")); return; }
  if (globalCommand.kind === "menu") { await goToMenu(conversation); return; }
  if (globalCommand.kind === "cancel") { await goToMenu(conversation, t(conversation.language, "cancelled")); return; }
  if (globalCommand.kind === "back") {
    if (globalCommand.nextStep === "menu") { await goToMenu(conversation, t(conversation.language, "back")); return; }
    // Booking-before-trip has no departure step: from passenger details, "back"
    // returns to the requested-date prompt, not the (skipped) departure list.
    const backStep = globalCommand.nextStep === "booking_departure"
      && conversation.data.booking?.routeId && !conversation.data.booking?.departureId
      ? "route_date" : globalCommand.nextStep;
    const next = await transitionState(conversation, backStep, conversation.data);
    await send(next, textMessage(`${t(next.language, "back")} ${promptForStep(next)}`)); return;
  }

  if (conversation.step === "language" || intent === "language") {
    const language = languageFromInput(message.text, message.actionId);
    if (!language) { await send(conversation, languageMessage()); return; }
    conversation = await setLanguage(conversation, language);
    await goToMenu(conversation, t(language, "languageChanged")); return;
  }

  if (conversation.step === "menu") {
    const numeric = message.text.trim();
    const selected = /^[1-8]$/.test(numeric)
      ? ["routes", "booking", "payment", "tracking", "mybookings", "question", "agent", "language"][Number(numeric) - 1]
      : intent;
    if (selected === "routes") { await startRouteSearch(conversation, false); return; }
    if (selected === "booking") { await startRouteSearch(conversation, true); return; }
    if (selected === "payment") {
      const next = await transitionState(conversation, "payment_booking_id", {});
      await send(next, textMessage(t(next.language, "askBookingIdPayment"))); return;
    }
    if (selected === "tracking") {
      const next = await transitionState(conversation, "tracking_booking_id", {});
      await send(next, textMessage(t(next.language, "askBookingIdTracking"))); return;
    }
    if (selected === "mybookings") {
      const lookup = await tryRouteLookup(conversation, () => listWhatsAppBookings(conversation.contactId));
      if (!lookup.ok) { await send(conversation, textMessage(t(conversation.language, "systemError"))); return; }
      if (!lookup.value.length) { await send(conversation, textMessage(t(conversation.language, "myBookingsEmpty"))); return; }
      const next = await transitionState(conversation, "my_bookings", {});
      await send(next, bookingsListMessage(next.language, lookup.value.map((b) => ({
        bookingId: b.bookingId, routeLabel: b.routeLabel, travelDate: b.travelDate,
        statusLabel: b.bookingFeeStatus === "paid" ? b.status : `${b.status} · fee unpaid`,
      }))));
      return;
    }
    if (selected === "question") {
      const next = await transitionState(conversation, "question", {});
      await send(next, textMessage(t(next.language, "askQuestion"))); return;
    }
    if (selected === "agent") {
      const next = await requestHuman(conversation);
      await send(next, textMessage(t(next.language, "agentWaiting"))); return;
    }
    if (selected === "language") { await send(conversation, languageMessage()); return; }
    await send(conversation, mainMenuMessage(conversation.language)); return;
  }

  if (conversation.step === "route_origin") {
    const origin = clean(message.text, 80);
    const lookup = await tryRouteLookup(conversation, () => findAvailableDepartures(origin));
    if (!lookup.ok) { await goToMenu(conversation, t(conversation.language, "routesUnavailable")); return; }
    const departures = lookup.value;
    const booking = conversation.data.booking !== undefined;
    if (!departures.length) {
      // Booking-before-trip (master plan §A): no scheduled departure, so offer
      // the supported routes and take a preferred date instead. "Find a Route"
      // (no booking) keeps the plain "no dates" reply.
      if (booking) {
        const routesLookup = await tryRouteLookup(conversation, () => listBookableRoutes(origin));
        if (routesLookup.ok && routesLookup.value.length) {
          const next = await transitionState(conversation, "route_pick", { ...conversation.data, origin });
          await send(next, routesListMessage(next.language, routesLookup.value.map((route) => ({
            routeId: route.routeId, label: route.label,
            fareLabel: route.priced ? `MWK ${route.fare.toLocaleString("en-MW")}` : t(next.language, "farePending"),
          }))));
          return;
        }
      }
      await send(conversation, textMessage(t(conversation.language, "noDepartures"))); return;
    }
    const next = await transitionState(conversation, booking ? "booking_departure" : "route_destination", { ...conversation.data, origin });
    await send(next, { type: "list", body: t(next.language, "askDestination"), button: "Departures", rows: departureRows(departures), fallback: `${t(next.language, "askDestination")}\n${departures.map((d, i) => `${i + 1}. ${d.routeLabel}, ${d.travelDate}, MWK ${d.fare}`).join("\n")}` });
    return;
  }

  // Booking-before-trip: pick a supported route, then a preferred future date.
  if (conversation.step === "route_pick") {
    const routeId = message.actionId?.startsWith("route:") ? message.actionId.slice(6) : "";
    const lookup = routeId ? await tryRouteLookup(conversation, () => loadBookableRoute(routeId)) : { ok: true as const, value: null };
    if (!lookup.ok) { await goToMenu(conversation, t(conversation.language, "routesUnavailable")); return; }
    const route = lookup.value;
    if (!route) { await send(conversation, textMessage(t(conversation.language, "invalidInput"))); return; }
    if (!route.priced) {
      // Never guess a fare. Flag the request for an agent and stop before
      // collecting passenger details.
      logWarn("WhatsApp unpriced route requested", {
        conversationId: conversation.conversationId, routeId: route.routeId, routeLabel: route.label,
      });
      await goToMenu(conversation, t(conversation.language, "routeUnpriced")); return;
    }
    const booking: BookingDraft = {
      routeId: route.routeId, routeLabel: route.label, pickup: route.pickup, fare: route.fare,
    };
    const next = await transitionState(conversation, "route_date", { ...conversation.data, booking });
    await send(next, textMessage(t(next.language, "askTravelDate"))); return;
  }

  if (conversation.step === "route_date") {
    const travelDate = parseFutureTravelDate(clean(message.text, 20));
    if (!travelDate) { await send(conversation, textMessage(t(conversation.language, "invalidTravelDate"))); return; }
    const booking = { ...conversation.data.booking, travelDate };
    const next = await transitionState(conversation, "booking_passenger_for", { ...conversation.data, booking });
    await send(next, passengerForMessage(next.language)); return;
  }

  if (conversation.step === "route_destination") {
    const departureId = message.actionId?.startsWith("departure:") ? message.actionId.slice(10) : "";
    const lookup = departureId ? await tryRouteLookup(conversation, () => loadDeparture(departureId)) : { ok: true as const, value: null };
    if (!lookup.ok) { await goToMenu(conversation, t(conversation.language, "routesUnavailable")); return; }
    const departure = lookup.value;
    if (!departure) { await send(conversation, textMessage(t(conversation.language, "invalidInput"))); return; }
    await goToMenu(conversation, `${departure.routeLabel}\n${departure.travelDate}${departure.departureTime ? ` ${departure.departureTime.slice(0, 5)}` : ""}\nMWK ${departure.fare.toLocaleString("en-MW")}\n${departure.availableSeats} seats available\nPickup: ${departure.pickup}`);
    return;
  }

  if (conversation.step === "booking_departure") {
    const departureId = message.actionId?.startsWith("departure:") ? message.actionId.slice(10) : "";
    const lookup = departureId ? await tryRouteLookup(conversation, () => loadDeparture(departureId)) : { ok: true as const, value: null };
    if (!lookup.ok) { await goToMenu(conversation, t(conversation.language, "routesUnavailable")); return; }
    const departure = lookup.value;
    if (!departure) { await send(conversation, textMessage(t(conversation.language, "invalidInput"))); return; }
    const booking: BookingDraft = {
      departureId, routeId: departure.routeId, routeLabel: departure.routeLabel,
      travelDate: departure.travelDate, departureTime: departure.departureTime, pickup: departure.pickup, fare: departure.fare,
    };
    const next = await transitionState(conversation, "booking_passenger_for", { ...conversation.data, booking });
    await send(next, passengerForMessage(next.language)); return;
  }

  if (conversation.step === "booking_passenger_for") {
    const value = message.text.trim().toLowerCase();
    const isSelf = message.actionId === "booking_self" || ["me", "myself", "self", "for me", "yanga", "ndi yanga", "1"].includes(value);
    const isOther = message.actionId === "booking_other" || ["someone else", "other", "wina", "munthu wina", "2"].includes(value);
    if (!isSelf && !isOther) { await send(conversation, passengerForMessage(conversation.language)); return; }
    const next = await transitionState(conversation, "booking_name", {
      ...conversation.data, booking: { ...conversation.data.booking, passengerIsSelf: isSelf },
    });
    await send(next, textMessage(t(next.language, "askName"))); return;
  }

  if (conversation.step === "booking_name") {
    const name = clean(message.text, 100);
    if (!validName(name)) { await send(conversation, textMessage(t(conversation.language, "invalidInput"))); return; }
    const next = await transitionState(conversation, "booking_email", { ...conversation.data, booking: { ...conversation.data.booking, name } });
    await send(next, textMessage(t(next.language, "askEmail"))); return;
  }
  if (conversation.step === "booking_email") {
    const raw = clean(message.text, 254).toLowerCase();
    const skipped = ["skip", "none", "palibe"].includes(raw);
    if (!skipped && !validEmail(raw)) { await send(conversation, textMessage(t(conversation.language, "invalidInput"))); return; }
    const next = await transitionState(conversation, "booking_student_id", { ...conversation.data, booking: { ...conversation.data.booking, email: skipped ? undefined : raw } });
    await send(next, textMessage(t(next.language, "askStudentId"))); return;
  }
  if (conversation.step === "booking_student_id") {
    const raw = clean(message.text, 50);
    const skipped = ["skip", "none", "palibe"].includes(raw.toLowerCase());
    const booking = { ...conversation.data.booking, studentId: skipped ? undefined : raw };
    const next = await transitionState(conversation, "booking_review", { ...conversation.data, booking });
    const fare = Number(booking.fare) || 0;
    const fee = await getBookingFeeAmount();
    const mwk = (n: number) => n.toLocaleString("en-MW");
    // No departureId => booking-before-trip: transport is assigned later, so the
    // review must not present an allocated seat/vehicle/pickup.
    const summary = booking.departureId
      ? t(next.language, "reviewSummary", {
          name: booking.name ?? "", route: booking.routeLabel ?? "", date: booking.travelDate ?? "",
          pickup: booking.pickup ?? "", fare: mwk(fare), fee: mwk(fee), total: mwk(fare + fee), balance: mwk(fare),
        })
      : t(next.language, "reviewSummaryUnassigned", {
          name: booking.name ?? "", route: booking.routeLabel ?? "", date: booking.travelDate ?? "",
          fare: mwk(fare), fee: mwk(fee), total: mwk(fare + fee), balance: mwk(fare),
          note: t(next.language, "unassignedNote"),
        });
    await send(next, confirmPromptMessage(next.language, summary)); return;
  }
  if (conversation.step === "booking_review") {
    if (!isAffirmative(message)) { await goToMenu(conversation, t(conversation.language, "cancelled")); return; }
    const draft = conversation.data.booking || {};
    const unassigned = !draft.departureId;
    const result = unassigned
      ? await createUnassignedWhatsAppBooking(conversation, draft, `meta:${message.id}`)
      : await createWhatsAppBooking(conversation, draft, `meta:${message.id}`);
    if (result.outcome === "rejected") {
      await goToMenu(conversation, t(conversation.language, bookingRejectionKey(result.reason), { limit: UNPAID_RESERVATION_LIMIT }));
      return;
    }
    const payment = await getOrCreateBookingFeeCheckout(result.bookingId, conversation.waId);
    const link = payment.outcome === "checkout" ? payment.url : "";
    const fee = result.bookingFee.toLocaleString("en-MW");
    const date = draft.travelDate ?? "";
    const deadline = result.expiresAt ? formatMalawiDateTime(Date.parse(result.expiresAt)) : "the stated deadline";
    let response: string;
    if (result.shortNotice) {
      response = t(conversation.language, unassigned ? "bookingHeldUnassignedShort" : "bookingHeldShort",
        { bookingId: result.bookingId, fee, link, date });
    } else if (link) {
      response = t(conversation.language, unassigned ? "bookingHeldUnassignedStandard" : "bookingHeldStandard",
        { bookingId: result.bookingId, fee, deadline, link, date });
    } else {
      response = t(conversation.language, unassigned ? "bookingHeldUnassignedNoLink" : "bookingHeldNoLink",
        { bookingId: result.bookingId, fee, deadline, date });
    }
    await goToMenu(conversation, response); return;
  }

  if (conversation.step === "payment_booking_id") {
    const bookingId = clean(message.text, 80);
    const result = await getOrCreateBookingFeeCheckout(bookingId, conversation.waId);
    const response = result.outcome === "paid" ? t(conversation.language, "paymentPaid", { bookingId })
      : result.outcome === "checkout" ? t(conversation.language, "paymentLink", { url: result.url })
      : t(conversation.language, "paymentFailed");
    await goToMenu(conversation, response); return;
  }

  if (conversation.step === "tracking_booking_id") {
    const view = await trackBookingForWhatsApp(clean(message.text, 80), conversation.waId);
    if (!view) {
      const failures = (conversation.data.trackingFailures || 0) + 1;
      logWarn("WhatsApp booking tracking contact mismatch", { conversationId: conversation.conversationId, failures });
      conversation = await transitionState(conversation, "tracking_booking_id", { ...conversation.data, trackingFailures: failures });
      await send(conversation, textMessage(t(conversation.language, "trackingNotFound"))); return;
    }
    await goToMenu(conversation, t(conversation.language, "trackingResult", {
      bookingId: view.bookingId, route: view.route, date: view.travelDate,
      journey: view.journeyStatus, payment: view.paymentStatus, pickup: view.pickup,
    })); return;
  }

  if (conversation.step === "my_bookings") {
    const bookingId = message.actionId?.startsWith("bk:") ? message.actionId.slice(3) : "";
    const detail = bookingId ? await loadWhatsAppBooking(bookingId, conversation.contactId) : null;
    if (!detail) { await send(conversation, textMessage(t(conversation.language, "selectBooking"))); return; }
    const next = await transitionState(conversation, "booking_action", { selectedBookingId: bookingId });
    const deadline = detail.bookingFeeStatus !== "paid" && detail.expiresAt
      ? t(next.language, "bookingDeadlineLine", { deadline: formatMalawiDateTime(Date.parse(detail.expiresAt)) })
      : "";
    const body = t(next.language, "bookingDetail", {
      bookingId: detail.bookingId, route: detail.routeLabel, date: detail.travelDate,
      status: detail.status, feeStatus: detail.bookingFeeStatus, fareStatus: detail.fareStatus, deadline,
    });
    await send(next, bookingActionMessage(next.language, body)); return;
  }

  if (conversation.step === "booking_action") {
    const bookingId = conversation.data.selectedBookingId || "";
    if (!bookingId) { await goToMenu(conversation); return; }
    if (message.actionId === "bk_pay") {
      const result = await getOrCreateBookingFeeCheckout(bookingId, conversation.waId);
      const response = result.outcome === "paid" ? t(conversation.language, "paymentPaid", { bookingId })
        : result.outcome === "checkout" ? t(conversation.language, "paymentLink", { url: result.url })
        : t(conversation.language, "paymentFailed");
      await goToMenu(conversation, response); return;
    }
    if (message.actionId === "bk_cancel") {
      const next = await transitionState(conversation, "cancel_confirm", { selectedBookingId: bookingId });
      await send(next, confirmPromptMessage(next.language, t(next.language, "cancelConfirmPrompt", { bookingId }))); return;
    }
    await send(conversation, textMessage(t(conversation.language, "selectBooking"))); return;
  }

  if (conversation.step === "cancel_confirm") {
    const bookingId = conversation.data.selectedBookingId || "";
    if (!isAffirmative(message)) { await goToMenu(conversation); return; }
    const result = await cancelWhatsAppBooking(bookingId, conversation.contactId);
    if (result.outcome === "cancelled") { await goToMenu(conversation, t(conversation.language, "cancelDone", { bookingId })); return; }
    if (result.outcome === "needs_agent") {
      conversation = await requestHuman(conversation);
      await send(conversation, textMessage(t(conversation.language, "cancelNeedsAgent"))); return;
    }
    await goToMenu(conversation, t(conversation.language, "cancelNotFound")); return;
  }

  if (conversation.step === "question") { await answerQuestion(conversation, message.text); return; }
  await send(conversation, textMessage(t(conversation.language, "invalidInput")));
}

// Processing has two phases with different retry semantics.
//
//   Phase 1 (claim → delivery-status update / inbound persistence): every
//   step is idempotent — the webhook-event claim is atomic, contact and
//   conversation upserts are keyed, and the inbound transcript insert
//   tolerates a duplicate provider_message_id. A failure here leaves no
//   customer-visible side effect, so the event is marked `failed` and stays
//   eligible for re-claim (on Meta redelivery, or a future recovery run).
//
//   Phase 2 (handleMessage): sends WhatsApp messages and may create a
//   booking or initiate a payment. Bookings and payments carry their own
//   idempotency keys, but outbound sends do not — the Cloud API has no
//   dedupe key — so blindly replaying this phase can deliver duplicate
//   customer messages. A failure here is therefore recorded and the event
//   is marked `processed` (not `failed`): it will not be auto-replayed, and
//   the partial transcript is visible in the admin inbox for manual
//   follow-up. This is a deliberate at-most-once handling boundary.
export async function processWhatsAppEvent(eventId: string): Promise<void> {
  const claimed = await claimWebhookEvent(eventId);
  if (!claimed) return;
  const event = claimed.event;
  const correlationId = claimed.correlationId;

  if (event.kind === "status") {
    try {
      await updateDeliveryStatus(event);
      await finishWebhookEvent(eventId);
      logInfo("WhatsApp event processed", { eventId, correlationId, kind: "status" });
    } catch (error) {
      const code = error instanceof Error ? error.message.slice(0, 120) : "unexpected_error";
      await failWebhookEvent(eventId, code);
      logError("WhatsApp status update failed", { eventId, correlationId, code });
    }
    return;
  }

  // Phase 1 — idempotent persistence. Safe to re-claim on failure.
  let conversation: WhatsAppConversationState & { optedOut: boolean };
  try {
    if (await isRateLimited(`whatsapp:${hashRateKey(event.from)}`, 60, 30)) {
      throw new Error("rate_limited");
    }
    conversation = await ensureConversation(event);
    await recordInbound(conversation, event);
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 120) : "unexpected_error";
    await failWebhookEvent(eventId, code);
    logError("WhatsApp event persistence failed", { eventId, correlationId, code });
    return;
  }

  // Phase 2 — side-effecting handling. Not re-claimed on failure (see above).
  try {
    markWhatsAppMessageRead(event.id).catch(() => undefined);
    await handleMessage(conversation, event);
    await finishWebhookEvent(eventId);
    logInfo("WhatsApp event processed", { eventId, correlationId, kind: "message" });
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 120) : "unexpected_error";
    await finishWebhookEvent(eventId);
    logError("WhatsApp event handling incomplete after persistence; not retrying", { eventId, correlationId, code });
    // Best-effort recovery reply so the customer is never left in silence.
    // One attempt, never retried (the event is already closed), so it cannot
    // loop or duplicate a booking/payment. Skipped for agent-managed chats,
    // and for stale-message conflicts where a newer message already advanced
    // the conversation.
    if (conversation.mode !== "human" && code !== "conversation_state_conflict") {
      try {
        await deliverAndRecord(conversation, { type: "text", text: t(conversation.language, "systemError") });
      } catch {
        /* sending is also failing — stop here, nothing more to do */
      }
    }
  }
}

// Called synchronously inside the webhook request so the `after()` callback
// inherits the request scope. Events from one delivery are processed in
// order: a batch can contain several messages for the same conversation, and
// the optimistic state-version check would otherwise make concurrent
// transitions collide.
export function scheduleWhatsAppProcessing(eventIds: string[]): void {
  if (!eventIds.length) return;
  after(async () => {
    for (const eventId of eventIds) {
      await processWhatsAppEvent(eventId);
    }
  });
}
