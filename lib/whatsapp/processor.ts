import "server-only";

import { after } from "next/server";
import { createHash } from "node:crypto";
import { isRateLimited } from "@/lib/rateLimit";
import { logError, logInfo, logWarn } from "@/lib/logger";
import { markWhatsAppMessageRead } from "@/lib/whatsapp/client";
import { getWhatsAppAiProvider } from "@/lib/whatsapp/ai-provider";
import { cancelWhatsAppBooking, createRouteRequest, createUnassignedWhatsAppBooking, createWhatsAppBooking, findAvailableDepartures, findDepartureForRouteDate, findGeneralRoute, findStudentRoute, getBookingFeeAmount, getOrCreateBookingFeeCheckout, listActiveUniversities, listBookableRoutes, listPopularRoutes, listWhatsAppBookings, loadBookableRoute, loadDeparture, loadWhatsAppBooking, matchActiveUniversity, trackBookingForWhatsApp, type AvailableDeparture, type BookableRoute } from "@/lib/whatsapp/domain";
import { UNPAID_RESERVATION_LIMIT, formatMalawiDateTime } from "@/lib/whatsapp/booking-rules";
import { resolveTravelDate } from "@/lib/whatsapp/travelDate";
import { classifySmalltalk } from "@/lib/whatsapp/smalltalk";
import { searchKnowledge } from "@/lib/whatsapp/ai/knowledgeStore";
import { isAiFeatureEnabled } from "@/lib/whatsapp/ai/flags";
import { interpretTurn } from "@/lib/whatsapp/ai/controller";
import { formatFromPack, gatherFacts } from "@/lib/whatsapp/ai/respond";
import { synthesiseReply } from "@/lib/whatsapp/ai/synthesise";
import { recordAiInteraction, setInteractionFeedback } from "@/lib/whatsapp/ai/audit";
import { prepareBookingDraft } from "@/lib/whatsapp/ai/bookingBridge";
import { classifyUrgency } from "@/lib/whatsapp/ai/urgency";
import { detectIntent, languageFromInput } from "@/lib/whatsapp/intent";
import { t } from "@/lib/whatsapp/i18n";
import { POPULAR_PAGE_SIZE, agentWaitingMessage, bookingActionMessage, bookingDoneMessage, bookingsListMessage, confirmPromptMessage, discardConfirmMessage, feedbackPromptMessage, languageMessage, mainMenuMessage, passengerForMessage, popularRoutesMessage, reviewActionsMessage, routeClarifyMessage, routeEntryMessage, routeRequestMessage, routeSelectedMessage, routesListMessage, studentDirectionMessage, universityListMessage } from "@/lib/whatsapp/messages";
import { matchDistrict, parseTypedRoute } from "@/lib/routeParsing";
import { cancelHumanRequest, claimWebhookEvent, deliverAndRecord, ensureConversation, failWebhookEvent, finishWebhookEvent, recordInbound, requestHuman, setLanguage, setOptOut, transitionState, updateDeliveryStatus } from "@/lib/whatsapp/repository";
import { reduceGlobalCommand } from "@/lib/whatsapp/state-machine";
import type { BookingDraft, WhatsAppConversationState, WhatsAppInboundMessage, WhatsAppOutboundMessage } from "@/lib/whatsapp/types";

function textMessage(text: string): WhatsAppOutboundMessage { return { type: "text", text }; }
function hashRateKey(waId: string): string { return createHash("sha256").update(waId).digest("hex").slice(0, 24); }
function clean(value: string, max = 120): string { return value.replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max); }
function validName(value: string): boolean { return value.length >= 2 && /^[\p{L}\p{M}][\p{L}\p{M}\s.'’-]*$/u.test(value); }
function validEmail(value: string): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }

function promptForStep(conversation: WhatsAppConversationState): string {
  const keys = {
    route_entry: "routeEntryIntro", route_student_direction: "routeStudentDirectionPrompt",
    route_student_university: "routeStudentPickUniversity", route_selected: "continueBooking",
    route_origin: "askOrigin", route_pick: "askRoute", route_date: "askTravelDate",
    booking_departure: "askDestination",
    booking_passenger_for: "askPassengerFor", booking_name: "askName",
    booking_email: "askEmail", booking_student_id: "askStudentId", booking_review: "confirmBooking",
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

// `opts`: a plain string is a one-line prefix before the menu; `{ welcome: true }`
// sends the branded welcome instead. The full welcome is only for a genuinely
// fresh start (new contact, deliberate restart, a resolved conversation
// reopened, an expired draft) — never before every routine menu.
async function goToMenu(
  conversation: WhatsAppConversationState,
  opts: string | { prefix?: string; welcome?: boolean } = {},
): Promise<WhatsAppConversationState> {
  const { prefix, welcome } = typeof opts === "string" ? { prefix: opts, welcome: false } : opts;
  const next = await transitionState(conversation, "menu", {});
  if (welcome) await send(next, textMessage(t(next.language, "welcomeIntro")));
  else if (prefix) await send(next, textMessage(prefix));
  await send(next, mainMenuMessage(next.language));
  return next;
}

const DRAFT_STEPS = new Set<WhatsAppConversationState["step"]>([
  "route_selected", "route_pick", "route_date", "booking_departure", "booking_passenger_for",
  "booking_name", "booking_email", "booking_student_id", "booking_review",
]);

// True when the customer is mid-booking AND has actually given us something
// worth not throwing away.
function hasDraftInProgress(conversation: WhatsAppConversationState): boolean {
  if (!DRAFT_STEPS.has(conversation.step)) return false;
  const b = conversation.data.booking;
  return Boolean(b && (b.name || b.routeId || b.departureId || b.travelDate));
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

function bookingListItem(b: { bookingId: string; routeLabel: string; travelDate: string; status: string; bookingFeeStatus: string }) {
  return {
    bookingId: b.bookingId, routeLabel: b.routeLabel, travelDate: b.travelDate,
    statusLabel: b.bookingFeeStatus === "paid" ? b.status : `${b.status} · fee unpaid`,
  };
}

// ---------------------------------------------------------------------------
// "Find a Route" and "Make a Booking" share ONE route-to-booking journey (§7):
// route_entry -> (resolve a route) -> route_selected -> Continue Booking ->
// route_date -> booking_passenger_for -> ... -> booking_review -> booking_done.
// ---------------------------------------------------------------------------

async function startRouteEntry(conversation: WhatsAppConversationState): Promise<void> {
  const next = await transitionState(conversation, "route_entry", {});
  await send(next, routeEntryMessage(next.language));
}

async function openMyBookings(conversation: WhatsAppConversationState): Promise<void> {
  const lookup = await tryRouteLookup(conversation, () => listWhatsAppBookings(conversation.contactId));
  if (!lookup.ok) { await send(conversation, textMessage(t(conversation.language, "systemError"))); return; }
  if (!lookup.value.length) { await send(conversation, textMessage(t(conversation.language, "myBookingsEmpty"))); return; }
  const next = await transitionState(conversation, "my_bookings", { myBookingsOffset: 0 });
  await send(next, bookingsListMessage(next.language, lookup.value.map(bookingListItem), 0));
}

function fareLabelFor(language: WhatsAppConversationState["language"], route: BookableRoute): string {
  return route.priced ? `MWK ${route.fare.toLocaleString("en-MW")}` : t(language, "farePending");
}

// A resolved route: keep it in the draft and offer Continue Booking. An
// unpriced route can't be booked here — flag it and stop, never guessing a fare.
async function showRouteSelected(conversation: WhatsAppConversationState, route: BookableRoute): Promise<void> {
  if (!route.priced) {
    logWarn("WhatsApp unpriced route selected", {
      conversationId: conversation.conversationId, routeId: route.routeId, routeLabel: route.label,
    });
    await goToMenu(conversation, t(conversation.language, "routeUnpriced"));
    return;
  }
  const booking: BookingDraft = {
    ...conversation.data.booking,
    routeId: route.routeId, routeLabel: route.label,
    origin: route.origin, destination: route.destination,
    pickup: route.pickup, fare: route.fare,
    travellerType: route.universityId ? "student" : "general",
    universityId: route.universityId ?? undefined,
    universityName: route.universityName ?? undefined,
    universityShortCode: route.universityShortCode ?? undefined,
    journeyDirection: route.universityId
      ? (route.label.startsWith(route.destination) ? "from_university" : "to_university")
      : undefined,
    // A new route selection drops any stale trip/departure binding.
    departureId: undefined, departureTime: undefined, travelDate: undefined,
  };
  const next = await transitionState(conversation, "route_selected", { ...conversation.data, booking });
  const summary = t(next.language, "routeSelectedSummary", {
    label: route.label, fare: `MWK ${route.fare.toLocaleString("en-MW")}`, pickup: route.pickup,
  });
  await send(next, routeSelectedMessage(next.language, summary));
}

async function showPopularRoutes(conversation: WhatsAppConversationState, offset = 0): Promise<void> {
  const base = conversation.step === "route_entry"
    ? await transitionState(conversation, "route_entry", { ...conversation.data, popularOffset: offset })
    : await transitionState(conversation, "route_entry", { popularOffset: offset });
  const lookup = await tryRouteLookup(base, () => listPopularRoutes());
  if (!lookup.ok) { await goToMenu(base, t(base.language, "routesUnavailable")); return; }
  if (!lookup.value.length) { await send(base, textMessage(t(base.language, "routePopularEmpty"))); return; }
  await send(base, popularRoutesMessage(base.language, lookup.value.map((route) => ({
    routeId: route.routeId, label: route.menuLabel, fareLabel: fareLabelFor(base.language, route),
    subtitle: route.universityName ?? undefined,
  })), offset));
}

function cleanPlaceLabel(value: string): string {
  return clean(value, 60).replace(/\b\w/g, (c) => c.toUpperCase());
}

// Try to place a typed origin -> destination against the structured routes.
// Collects every candidate (student to/from-university legs + a district
// general leg), then:
//   0 matches -> "request this route"
//   1 match   -> show it
//   >1 match  -> show the choices, never guess (spec §4).
async function resolveCorridor(
  conversation: WhatsAppConversationState, rawOrigin: string, rawDestination: string,
): Promise<void> {
  const lane = conversation.data.travellerType;
  const originDistrict = matchDistrict(rawOrigin);
  const destDistrict = matchDistrict(rawDestination);

  const unisLookup = await tryRouteLookup(conversation, () => listActiveUniversities());
  const unis = unisLookup.ok ? unisLookup.value : [];
  const destUni = matchActiveUniversity(clean(rawDestination, 60), unis);
  const originUni = matchActiveUniversity(clean(rawOrigin, 60), unis);

  const candidates: BookableRoute[] = [];
  const add = (route: BookableRoute | null) => {
    if (route && !candidates.some((c) => c.routeId === route.routeId)) candidates.push(route);
  };

  if (lane !== "general") {
    if (destUni && originDistrict) {
      const r = await tryRouteLookup(conversation, () => findStudentRoute(originDistrict, destUni.id, "to_university"));
      if (r.ok) add(r.value);
    }
    if (originUni && destDistrict) {
      const r = await tryRouteLookup(conversation, () => findStudentRoute(destDistrict, originUni.id, "from_university"));
      if (r.ok) add(r.value);
    }
  }
  if (originDistrict && destDistrict) {
    const r = await tryRouteLookup(conversation, () => findGeneralRoute(originDistrict, destDistrict));
    if (r.ok) add(r.value);
  }

  if (candidates.length === 1) { await showRouteSelected(conversation, candidates[0]); return; }
  if (candidates.length > 1) {
    const next = await transitionState(conversation, "route_entry", { ...conversation.data });
    await send(next, routesListMessage(next.language, candidates.map((route) => ({
      routeId: route.routeId, label: route.menuLabel, fareLabel: fareLabelFor(next.language, route),
      subtitle: route.universityName ?? undefined,
    }))));
    return;
  }

  const pendingRouteOrigin = originUni ? originUni.name : cleanPlaceLabel(rawOrigin);
  const pendingRouteDestination = destUni ? destUni.name : cleanPlaceLabel(rawDestination);
  const next = await transitionState(conversation, "route_request_confirm", {
    travellerType: conversation.data.travellerType,
    pendingRouteOrigin, pendingRouteDestination,
  });
  await send(next, routeRequestMessage(next.language, pendingRouteOrigin, pendingRouteDestination));
}

// Only reached at step "question", so deterministic menu/button handling and
// active booking steps have already had priority, and human-controlled
// conversations returned earlier (mode === "human") — the AI never sees those.
// AI output only picks which existing prompt to show; it never books, pays,
// or changes state. Any failure falls back to a prompt, never silence.
async function answerQuestion(conversation: WhatsAppConversationState, question: string): Promise<void> {
  // Stage 5 (§19): an urgent message goes straight to a person — no AI advice,
  // works even with AI disabled. The bot keeps serving while they wait (§14).
  if (classifyUrgency(question) === "urgent") {
    const next = await requestHuman(conversation);
    await send(next, textMessage(t(next.language, "agentWaiting")));
    await send(next, agentWaitingMessage(next.language));
    void recordAiInteraction({
      conversationId: conversation.conversationId, contactId: conversation.contactId,
      customerMessage: question, detectedLanguage: conversation.language, detectedIntent: "urgent_support",
      confidence: 1, entities: {}, requestedTool: null, allowedTool: null, toolOutcome: "none",
      fallbackUsed: false, clarificationRequested: false, humanRequested: true, urgency: "urgent",
      responsePreview: "(urgent — agent requested)", responseMs: 0,
    });
    return;
  }

  // A bare pleasantry (thanks / hello / goodbye) with no real question in it:
  // answer warmly and stop. Neither the knowledge base nor the model handles
  // these today, so the customer would otherwise get silence or a clumsy
  // "I didn't understand". Anything carrying a question keyword is not matched
  // here and follows the normal path below.
  const smalltalk = classifySmalltalk(question);
  if (smalltalk) {
    const key = smalltalk === "thanks" ? "smalltalkThanks"
      : smalltalk === "farewell" ? "smalltalkFarewell" : "smalltalkGreeting";
    await send(conversation, textMessage(t(conversation.language, key)));
    return;
  }

  // Stage 2: search the admin-managed approved knowledge first (falls back to
  // the built-in matcher when the table is empty / unavailable, so this is a
  // strict superset of the previous behaviour). An entry flagged
  // requires_live_data is NOT answered from static text — it drops through to
  // the model-assisted routing below.
  const hit = await searchKnowledge(question, conversation.language);
  if ((hit.source === "table" && !hit.requiresLiveData) || hit.source === "builtin") {
    await send(conversation, textMessage(hit.answer)); return;
  }
  // Prompt injection is a hard stop — never forwarded to the model.
  if (hit.source === "none" && hit.outcome === "unsafe") {
    await send(conversation, textMessage(t(conversation.language, "unrelatedQuestion"))); return;
  }
  const unrelated = hit.source === "none" && hit.outcome === "unrelated";

  // Stage 3: when live tools are enabled, let the controller read the turn and
  // answer from VERIFIED data via the tool registry. Any failure, or nothing
  // it can answer, falls through to the legacy hint path below.
  if (isAiFeatureEnabled("liveTools")) {
    const started = Date.now();
    const recent = conversation.data.aiRecent ?? [];
    const controller = await interpretTurn(question, conversation.language, recent);
    let replied = false;
    let clarification = false;
    let synthesised = false;
    let handledInPlace = false;
    let allowedTool: string | null = null;
    let toolOutcome: "none" | "ok" | "denied" | "error" = "none";
    let previewText: string | null = null;

    if (controller.requiresHuman || controller.urgency === "urgent") {
      // Stage 5 will attach an agent summary; for now raise the request and
      // keep serving (§14).
      const next = await requestHuman(conversation);
      await send(next, textMessage(t(next.language, "agentWaiting")));
      await send(next, agentWaitingMessage(next.language));
      replied = true;
      previewText = "(agent requested)";
    } else if (controller.intent === "start_booking" && isAiFeatureEnabled("bookingDrafts")) {
      // Stage 4: prepare a draft from the natural-language request, then hand
      // to the deterministic flow. The AI never creates the booking.
      const bridge = await prepareBookingDraft(controller.entities);
      allowedTool = "createBookingDraft";
      if (bridge.outcome === "ready") {
        const next = await transitionState(conversation, "route_selected", { booking: bridge.draft });
        if (bridge.dateLabel) {
          await send(next, textMessage(t(next.language, "travelDateConfirmed", { date: bridge.dateLabel })));
        }
        await send(next, routeSelectedMessage(next.language, t(next.language, "routeSelectedSummary", {
          label: bridge.draft.routeLabel ?? "",
          fare: `MWK ${(Number(bridge.draft.fare) || 0).toLocaleString("en-MW")}`,
          pickup: bridge.draft.pickup ?? "",
        })));
        replied = true; toolOutcome = "ok"; previewText = `(draft: ${bridge.draft.routeLabel})`;
      } else if (bridge.outcome === "need_origin") {
        await send(conversation, textMessage(t(conversation.language, "routeAskOriginPlace")));
        replied = true; clarification = true; previewText = "(clarify origin)";
      } else if (bridge.outcome === "need_destination") {
        await send(conversation, textMessage(t(conversation.language, "routeAskDestinationPlace")));
        replied = true; clarification = true; previewText = "(clarify destination)";
      } else {
        await send(conversation, textMessage(t(conversation.language, "routeNotFoundPrompt", { origin: bridge.origin, destination: bridge.destination })));
        replied = true; toolOutcome = "ok"; previewText = "(no route)";
      }
    } else {
      handledInPlace = true;
      // Phase A1: gather every verified fact the turn needs, then either let
      // the model compose the reply from that pack (guarded) or fall back to
      // the deterministic formatter over the same pack.
      const pack = await gatherFacts(controller, { contactId: conversation.contactId, waId: conversation.waId });
      allowedTool = pack.allowedTool;
      toolOutcome = pack.toolOutcome;

      if (isAiFeatureEnabled("synthesis") && pack.facts.length && !pack.needsClarification) {
        const s = await synthesiseReply(question, conversation.language, pack, recent);
        if (s.text) {
          await send(conversation, textMessage(s.text));
          replied = true; synthesised = true; previewText = s.text;
        }
      }
      if (!replied) {
        const live = formatFromPack(controller, pack);
        if (live.text) { await send(conversation, textMessage(live.text)); replied = true; previewText = live.text; }
        else if (live.needsClarification) {
          await send(conversation, textMessage(live.needsClarification));
          replied = true; clarification = true; previewText = live.needsClarification;
        }
      }
    }

    const interactionId = await recordAiInteraction({
      conversationId: conversation.conversationId, contactId: conversation.contactId,
      inboundMessageId: null, customerMessage: question,
      detectedLanguage: controller.language, detectedIntent: controller.intent,
      confidence: controller.confidence, entities: controller.entities,
      requestedTool: controller.requestedTool, allowedTool, toolOutcome,
      fallbackUsed: !replied, clarificationRequested: clarification,
      humanRequested: controller.requiresHuman, urgency: controller.urgency,
      responsePreview: previewText, responseMs: Date.now() - started,
      model: synthesised ? "synthesis" : null,
    });

    if (replied) {
      if (handledInPlace) {
        // Ask for feedback only on the weaker answers (§24): a deterministic
        // fallback, or a low-confidence read. Never after a clarification.
        const offerFeedback = !clarification
          && (!synthesised || controller.confidence < 0.7)
          && conversation.data.lastAiInteractionId !== interactionId;
        if (offerFeedback) await send(conversation, feedbackPromptMessage(conversation.language));
        // Keep a short rolling memory for follow-ups (only when we stayed on
        // the question step — agent / booking-draft paths moved elsewhere).
        const nextRecent = [
          ...recent,
          { role: "user" as const, text: question.slice(0, 160) },
          ...(previewText ? [{ role: "bot" as const, text: previewText.replace(/\n+/g, " ").slice(0, 160) }] : []),
        ].slice(-6);
        await transitionState(conversation, "question", {
          ...conversation.data, aiRecent: nextRecent,
          lastAiInteractionId: offerFeedback ? (interactionId ?? undefined) : conversation.data.lastAiInteractionId,
        });
      }
      return;
    }
  }

  // The matcher couldn't place it — ask the model to interpret. With AI off,
  // fall back to the blunt safe response.
  const provider = getWhatsAppAiProvider();
  if (!provider) {
    await send(conversation, textMessage(t(conversation.language, unrelated ? "unrelatedQuestion" : "aiUnavailable"))); return;
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

  // A fresh start: a conversation an agent had resolved, or a booking draft
  // that timed out. Reset to the menu and greet with the full welcome once,
  // then let this same message be handled at the menu below. (Chat history,
  // language, bookings and payments are untouched — only the transient step +
  // state_data are cleared, via the version-aware transition so an older
  // in-flight message cannot resurrect the old step.)
  const midFlow = conversation.step !== "menu" && conversation.step !== "language";
  const expiredDraft = midFlow && conversation.stateExpiresAt != null
    && Date.parse(conversation.stateExpiresAt) < Date.now();
  if (conversation.status === "resolved" || expiredDraft) {
    conversation = await transitionState(conversation, "menu", {});
    await send(conversation, textMessage(t(conversation.language, "welcomeIntro")));
  }

  const globalCommand = reduceGlobalCommand(conversation.step, intent);

  // Mid-draft "menu" / "restart" (often accidental — "hi", "hello", "menu"):
  // confirm before throwing captured details away. An explicit "cancel", "back"
  // or agent request still goes straight through.
  if (["menu", "restart"].includes(globalCommand.kind) && hasDraftInProgress(conversation)) {
    const next = await transitionState(conversation, "discard_confirm", {
      ...conversation.data,
      pendingExit: globalCommand.kind as "menu" | "restart",
      draftStep: conversation.step,
    });
    await send(next, discardConfirmMessage(next.language)); return;
  }

  // Answering the discard prompt: only an explicit Confirm discards; anything
  // else keeps the draft and resumes.
  if (conversation.step === "discard_confirm" && globalCommand.kind !== "handoff") {
    const draftStep = conversation.data.draftStep;
    if (!isAffirmative(message) && draftStep) {
      const next = await transitionState(conversation, draftStep, {
        ...conversation.data, pendingExit: undefined, draftStep: undefined,
      });
      await send(next, textMessage(`${t(next.language, "draftKept")} ${promptForStep(next)}`)); return;
    }
    const exit = conversation.data.pendingExit;
    if (exit === "restart") { await goToMenu(conversation, { welcome: true }); return; }
    if (exit === "cancel") { await goToMenu(conversation, t(conversation.language, "cancelled")); return; }
    await goToMenu(conversation); return;
  }

  // Cancel a not-yet-picked-up agent request; keep serving from the same step.
  if (message.actionId === "cancel_agent") {
    conversation = await cancelHumanRequest(conversation);
    await send(conversation, textMessage(t(conversation.language, "agentRequestCancelled")));
    if (!hasDraftInProgress(conversation)) { await goToMenu(conversation); }
    return;
  }

  // Helpful / Still-need-help on the last AI answer (§24).
  if (message.actionId === "ai_helpful" || message.actionId === "ai_needs_help") {
    const id = conversation.data.lastAiInteractionId;
    await setInteractionFeedback(id, message.actionId === "ai_helpful" ? "helpful" : "needs_help");
    conversation = await transitionState(conversation, conversation.step, { ...conversation.data, lastAiInteractionId: undefined });
    if (message.actionId === "ai_helpful") {
      await send(conversation, textMessage(t(conversation.language, "feedbackThanks")));
    } else {
      conversation = await requestHuman(conversation);
      await send(conversation, textMessage(t(conversation.language, "agentWaiting")));
      await send(conversation, agentWaitingMessage(conversation.language));
    }
    return;
  }

  if (globalCommand.kind === "handoff") {
    // §14 — raise the request and alert the on-call admin, but the bot keeps
    // control from the same step: the customer can carry on booking while they
    // wait. Only an admin "Take Over" (mode -> human) actually silences the bot.
    conversation = await requestHuman(conversation);
    await send(conversation, textMessage(t(conversation.language, "agentWaiting")));
    await send(conversation, agentWaitingMessage(conversation.language)); return;
  }
  if (globalCommand.kind === "restart") { await goToMenu(conversation, { welcome: true }); return; }
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
    const onboarding = conversation.step === "language";
    conversation = await setLanguage(conversation, language);
    // First-ever language pick → branded welcome. A later "Change language"
    // just confirms and shows the menu.
    await goToMenu(conversation, onboarding ? { welcome: true } : t(language, "languageChanged"));
    return;
  }

  if (conversation.step === "menu") {
    const numeric = message.text.trim();
    const selected = /^[1-8]$/.test(numeric)
      ? ["routes", "booking", "payment", "tracking", "mybookings", "question", "agent", "language"][Number(numeric) - 1]
      : intent;
    // Find a Route and Make a Booking are the same journey now (§7).
    if (selected === "routes" || selected === "booking") { await startRouteEntry(conversation); return; }
    if (selected === "payment") {
      const next = await transitionState(conversation, "payment_booking_id", {});
      await send(next, textMessage(t(next.language, "askBookingIdPayment"))); return;
    }
    if (selected === "tracking") {
      const next = await transitionState(conversation, "tracking_booking_id", {});
      await send(next, textMessage(t(next.language, "askBookingIdTracking"))); return;
    }
    if (selected === "mybookings") { await openMyBookings(conversation); return; }
    if (selected === "question") {
      const next = await transitionState(conversation, "question", {});
      await send(next, textMessage(t(next.language, "askQuestion"))); return;
    }
    if (selected === "agent") {
      const next = await requestHuman(conversation);
      await send(next, textMessage(t(next.language, "agentWaiting")));
      await send(next, agentWaitingMessage(next.language)); return;
    }
    if (selected === "language") { await send(conversation, languageMessage()); return; }
    await send(conversation, mainMenuMessage(conversation.language)); return;
  }

  if (conversation.step === "route_entry") {
    const action = message.actionId || "";
    const value = message.text.trim().toLowerCase();
    if (action === "route_menu" || value === "main menu") { await goToMenu(conversation); return; }
    if (action === "route_popular" || /^\s*popular/.test(value)) { await showPopularRoutes(conversation, 0); return; }
    if (action === "route_popular_more") {
      await showPopularRoutes(conversation, (conversation.data.popularOffset ?? 0) + POPULAR_PAGE_SIZE); return;
    }
    if (action === "route_popular_prev") {
      await showPopularRoutes(conversation, Math.max(0, (conversation.data.popularOffset ?? 0) - POPULAR_PAGE_SIZE)); return;
    }
    if (action === "route_student" || /^\s*student/.test(value)) {
      const next = await transitionState(conversation, "route_student_direction", {});
      await send(next, studentDirectionMessage(next.language)); return;
    }
    if (action === "route_other" || /^\s*other/.test(value)) {
      const next = await transitionState(conversation, "route_entry", { travellerType: "general" });
      await send(next, textMessage(t(next.language, "routeOtherPrompt"))); return;
    }
    if (action.startsWith("route:")) {
      const routeId = action.slice(6);
      const lookup = await tryRouteLookup(conversation, () => loadBookableRoute(routeId));
      if (!lookup.ok) { await goToMenu(conversation, t(conversation.language, "routesUnavailable")); return; }
      if (!lookup.value) { await send(conversation, textMessage(t(conversation.language, "invalidInput"))); return; }
      await showRouteSelected(conversation, lookup.value); return;
    }

    const parsed = parseTypedRoute(message.text);
    const known = conversation.data.routeKnownPlace;
    const knownRole = conversation.data.routeKnownRole;
    if (known && knownRole) {
      if (parsed?.kind === "pair") { await resolveCorridor(conversation, parsed.origin, parsed.destination); return; }
      const other = parsed?.kind === "single" ? parsed.place : "";
      if (!other) { await send(conversation, textMessage(t(conversation.language, "routeClarifyUnclear"))); return; }
      const origin = knownRole === "origin" ? known : other;
      const destination = knownRole === "origin" ? other : known;
      await resolveCorridor(conversation, origin, destination); return;
    }
    if (parsed?.kind === "pair") { await resolveCorridor(conversation, parsed.origin, parsed.destination); return; }
    if (parsed?.kind === "single") {
      const next = await transitionState(conversation, "route_clarify", {
        ...conversation.data, routeKnownPlace: parsed.place,
      });
      await send(next, routeClarifyMessage(next.language, parsed.place)); return;
    }
    await send(conversation, textMessage(t(conversation.language, "routeClarifyUnclear"))); return;
  }

  if (conversation.step === "route_clarify") {
    const action = message.actionId || "";
    const place = conversation.data.routeKnownPlace || "";
    if (action === "route_restart" || !place) { await startRouteEntry(conversation); return; }
    if (action === "route_from" || action === "route_to") {
      const role = action === "route_from" ? "origin" : "destination";
      const next = await transitionState(conversation, "route_entry", {
        ...conversation.data, routeKnownPlace: place, routeKnownRole: role,
      });
      await send(next, textMessage(t(next.language, role === "origin" ? "routeAskDestinationPlace" : "routeAskOriginPlace")));
      return;
    }
    await send(conversation, routeClarifyMessage(conversation.language, place)); return;
  }

  if (conversation.step === "route_student_direction") {
    const action = message.actionId || "";
    const direction = action === "route_dir_to" ? "to_university"
      : action === "route_dir_from" ? "from_university" : null;
    if (!direction) { await send(conversation, studentDirectionMessage(conversation.language)); return; }
    const lookup = await tryRouteLookup(conversation, () => listActiveUniversities());
    if (!lookup.ok) { await goToMenu(conversation, t(conversation.language, "routesUnavailable")); return; }
    if (!lookup.value.length) { await goToMenu(conversation, t(conversation.language, "routeNoUniversities")); return; }
    const next = await transitionState(conversation, "route_student_university", { studentDirection: direction });
    await send(next, universityListMessage(next.language, lookup.value)); return;
  }

  if (conversation.step === "route_student_university") {
    const action = message.actionId || "";
    const direction = conversation.data.studentDirection || "to_university";
    if (!action.startsWith("uni:")) {
      const lookup = await tryRouteLookup(conversation, () => listActiveUniversities());
      if (lookup.ok && lookup.value.length) { await send(conversation, universityListMessage(conversation.language, lookup.value)); return; }
      await goToMenu(conversation, t(conversation.language, "routeNoUniversities")); return;
    }
    const universityId = action.slice(4);
    const lookup = await tryRouteLookup(conversation, () => listActiveUniversities());
    const university = lookup.ok ? lookup.value.find((u) => u.id === universityId) : undefined;
    if (!university) { await send(conversation, textMessage(t(conversation.language, "invalidInput"))); return; }
    const next = await transitionState(conversation, "route_student_home", {
      studentDirection: direction, studentUniversityId: university.id, studentUniversityName: university.name,
    });
    await send(next, textMessage(t(next.language, direction === "to_university" ? "routeAskHomeTo" : "routeAskHomeFrom")));
    return;
  }

  if (conversation.step === "route_student_home") {
    const direction = conversation.data.studentDirection || "to_university";
    const universityId = conversation.data.studentUniversityId || "";
    const universityName = conversation.data.studentUniversityName || "";
    const typed = clean(message.text, 60);
    const homeDistrict = matchDistrict(typed) || typed;
    if (!homeDistrict || !universityId) {
      await send(conversation, textMessage(t(conversation.language, direction === "to_university" ? "routeAskHomeTo" : "routeAskHomeFrom")));
      return;
    }
    const lookup = await tryRouteLookup(conversation, () => findStudentRoute(homeDistrict, universityId, direction));
    if (!lookup.ok) { await goToMenu(conversation, t(conversation.language, "routesUnavailable")); return; }
    if (lookup.value) { await showRouteSelected(conversation, lookup.value); return; }
    const pendingRouteOrigin = direction === "to_university" ? cleanPlaceLabel(homeDistrict) : universityName;
    const pendingRouteDestination = direction === "to_university" ? universityName : cleanPlaceLabel(homeDistrict);
    const next = await transitionState(conversation, "route_request_confirm", {
      travellerType: "student", pendingRouteOrigin, pendingRouteDestination,
    });
    await send(next, routeRequestMessage(next.language, pendingRouteOrigin, pendingRouteDestination)); return;
  }

  if (conversation.step === "route_request_confirm") {
    const action = message.actionId || "";
    const origin = conversation.data.pendingRouteOrigin || "";
    const destination = conversation.data.pendingRouteDestination || "";
    if (action === "route_popular") { await showPopularRoutes(conversation); return; }
    if (action === "route_menu") { await goToMenu(conversation); return; }
    if (action === "route_req_submit" || isAffirmative(message)) {
      try {
        await createRouteRequest({
          source: "whatsapp", origin, destination,
          travellerType: conversation.data.travellerType ?? null,
          requestedByPhone: conversation.waId, whatsappContactId: conversation.contactId,
        });
      } catch (error) {
        logWarn("WhatsApp route request not logged", {
          conversationId: conversation.conversationId,
          code: error instanceof Error ? error.message.slice(0, 120) : "unknown",
        });
      }
      await goToMenu(conversation, t(conversation.language, "routeRequestLogged", { origin, destination })); return;
    }
    await send(conversation, routeRequestMessage(conversation.language, origin, destination)); return;
  }

  // Resolved route: Continue Booking carries straight into the same draft (§7).
  if (conversation.step === "route_selected") {
    const action = message.actionId || "";
    const draft = conversation.data.booking || {};
    if (action === "route_change" || /^\s*change/.test(message.text.trim().toLowerCase())) {
      await startRouteEntry(conversation); return;
    }
    if (action === "route_menu") { await goToMenu(conversation); return; }
    if (isAffirmative(message) || /^\s*continue/.test(message.text.trim().toLowerCase())) {
      // A date already on the draft (e.g. from a natural-language "…tomorrow"
      // request) skips the date prompt and does the trip lookup right away.
      if (draft.travelDate) {
        const travelDate = draft.travelDate;
        let booking: BookingDraft = { ...draft, departureId: undefined, departureTime: undefined };
        let tripLine = t(conversation.language, "noTripLine");
        if (booking.routeId) {
          const dep = await tryRouteLookup(conversation, () => findDepartureForRouteDate(booking.routeId!, travelDate));
          if (dep.ok && dep.value) {
            booking = { ...booking, departureId: dep.value.id, departureTime: dep.value.departureTime, pickup: dep.value.pickup || booking.pickup, fare: dep.value.fare || booking.fare };
            tripLine = t(conversation.language, "tripConfirmedLine", {
              date: travelDate, time: dep.value.departureTime ? ` at ${dep.value.departureTime.slice(0, 5)}` : "",
              pickup: dep.value.pickup || booking.pickup || "",
            });
          }
        }
        const next = await transitionState(conversation, "booking_passenger_for", { ...conversation.data, booking });
        await send(next, textMessage(tripLine));
        await send(next, passengerForMessage(next.language)); return;
      }
      const next = await transitionState(conversation, "route_date", { ...conversation.data, booking: draft });
      await send(next, textMessage(t(next.language, "askTravelDate"))); return;
    }
    const summary = t(conversation.language, "routeSelectedSummary", {
      label: draft.routeLabel ?? "", fare: `MWK ${(Number(draft.fare) || 0).toLocaleString("en-MW")}`,
      pickup: draft.pickup ?? "",
    });
    await send(conversation, routeSelectedMessage(conversation.language, summary)); return;
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
            routeId: route.routeId, label: route.menuLabel,
            fareLabel: route.priced ? `MWK ${route.fare.toLocaleString("en-MW")}` : t(next.language, "farePending"),
            subtitle: route.universityName ?? undefined,
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
    const resolved = resolveTravelDate(clean(message.text, 40));
    if (!resolved.ok) {
      const key = resolved.reason === "past" ? "travelDatePast"
        : resolved.reason === "too_far" ? "travelDateTooFar" : "invalidTravelDate";
      await send(conversation, textMessage(t(conversation.language, key))); return;
    }
    // Route + date are set — now look for a published trip on that exact date
    // (§8). If one exists, bind it and show verified info; if not, keep the
    // reservation and say so plainly. Either way the flow continues.
    let booking: BookingDraft = {
      ...conversation.data.booking, travelDate: resolved.iso,
      departureId: undefined, departureTime: undefined,
    };
    let tripLine = t(conversation.language, "noTripLine");
    if (booking.routeId) {
      const dep = await tryRouteLookup(conversation, () => findDepartureForRouteDate(booking.routeId!, resolved.iso));
      if (dep.ok && dep.value) {
        booking = {
          ...booking, departureId: dep.value.id, departureTime: dep.value.departureTime,
          pickup: dep.value.pickup || booking.pickup, fare: dep.value.fare || booking.fare,
        };
        tripLine = t(conversation.language, "tripConfirmedLine", {
          date: resolved.label,
          time: dep.value.departureTime ? ` at ${dep.value.departureTime.slice(0, 5)}` : "",
          pickup: dep.value.pickup || booking.pickup || "",
        });
      }
    }
    const next = await transitionState(conversation, "booking_passenger_for", { ...conversation.data, booking });
    // Echo the resolved date + trip status — never silently changed (§8).
    await send(next, textMessage(`${t(next.language, "travelDateConfirmed", { date: resolved.label })}\n\n${tripLine}`));
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
    // Context lines (§9): traveller type, university + direction, trip status.
    const context: string[] = [];
    if (booking.travellerType === "student") context.push(t(next.language, "reviewTravellerStudent"));
    else if (booking.travellerType === "general") context.push(t(next.language, "reviewTravellerGeneral"));
    if (booking.universityName) {
      context.push(t(next.language, "reviewUniversityLine", {
        university: booking.universityShortCode || booking.universityName,
        direction: t(next.language, booking.journeyDirection === "from_university" ? "routeDirFromUni" : "routeDirToUni"),
      }));
    }
    context.push(t(next.language, booking.departureId ? "reviewTripStatusAssigned" : "reviewTripStatusPending"));
    const prefix = context.length ? context.join("\n") + "\n\n" : "";
    // No departureId => booking-before-trip: transport is assigned later, so the
    // review must not present an allocated seat/vehicle/pickup.
    const body = booking.departureId
      ? t(next.language, "reviewSummary", {
          name: booking.name ?? "", route: booking.routeLabel ?? "", date: booking.travelDate ?? "",
          pickup: booking.pickup ?? "", fare: mwk(fare), fee: mwk(fee), total: mwk(fare + fee), balance: mwk(fare),
        })
      : t(next.language, "reviewSummaryUnassigned", {
          name: booking.name ?? "", route: booking.routeLabel ?? "", date: booking.travelDate ?? "",
          fare: mwk(fare), fee: mwk(fee), total: mwk(fare + fee), balance: mwk(fare),
          note: t(next.language, "unassignedNote"),
        });
    await send(next, reviewActionsMessage(next.language, prefix + body)); return;
  }
  if (conversation.step === "booking_review") {
    const action = message.actionId || "";
    if (action === "edit_route") { await startRouteEntry(conversation); return; }
    if (action === "edit_date") {
      const next = await transitionState(conversation, "route_date", { ...conversation.data });
      await send(next, textMessage(t(next.language, "askTravelDate"))); return;
    }
    if (action === "edit_passenger") {
      const next = await transitionState(conversation, "booking_name", { ...conversation.data });
      await send(next, textMessage(t(next.language, "askName"))); return;
    }
    // A plain "back" is still handled by the global back command above.
    // Anything else non-affirmative cancels.
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
    // §10 — hold message, then what next (never a dead end at the menu).
    const done = await transitionState(conversation, "booking_done", {});
    await send(done, textMessage(response));
    await send(done, bookingDoneMessage(done.language)); return;
  }

  if (conversation.step === "booking_done") {
    const action = message.actionId || "";
    if (action === "menu_booking" || intent === "booking") { await startRouteEntry(conversation); return; }
    if (action === "menu_mybookings" || intent === "mybookings") { await openMyBookings(conversation); return; }
    if (action === "menu_payment" || intent === "payment") {
      const next = await transitionState(conversation, "payment_booking_id", {});
      await send(next, textMessage(t(next.language, "askBookingIdPayment"))); return;
    }
    await goToMenu(conversation); return;
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
    if (bookingId === "more") {
      const lookup = await tryRouteLookup(conversation, () => listWhatsAppBookings(conversation.contactId));
      if (!lookup.ok || !lookup.value.length) { await send(conversation, textMessage(t(conversation.language, "selectBooking"))); return; }
      const offset = (conversation.data.myBookingsOffset ?? 0) + 9;
      const next = await transitionState(conversation, "my_bookings", { myBookingsOffset: offset });
      await send(next, bookingsListMessage(next.language, lookup.value.map(bookingListItem), offset)); return;
    }
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
