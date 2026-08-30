import "server-only";

// Stage 4 — turn a natural-language booking request into a BookingDraft, then
// hand straight to the existing deterministic booking state machine. The AI
// prepares; it never creates the booking. Behind the `bookingDrafts` flag.

import {
  findGeneralRoute, findStudentRoute, listActiveUniversities, matchActiveUniversity,
  type BookableRoute,
} from "@/lib/whatsapp/domain";
import { matchDistrict } from "@/lib/routeParsing";
import { resolveTravelDate } from "@/lib/whatsapp/travelDate";
import type { ControllerEntities } from "@/lib/whatsapp/ai/schema";
import type { BookingDraft } from "@/lib/whatsapp/types";

export type BridgeResult =
  | { outcome: "ready"; draft: BookingDraft; dateLabel: string | null }
  | { outcome: "no_route"; origin: string; destination: string }
  | { outcome: "need_origin" }
  | { outcome: "need_destination"; origin: string };

function safe<T>(p: Promise<T>): Promise<T | null> {
  return p.then((v) => v).catch(() => null);
}

export async function prepareBookingDraft(e: ControllerEntities): Promise<BridgeResult> {
  const origin = (e.origin || "").trim();
  const destination = (e.destination || e.university || "").trim();
  if (!origin) return { outcome: "need_origin" };
  if (!destination) return { outcome: "need_destination", origin };

  const originDistrict = matchDistrict(origin);
  const destDistrict = matchDistrict(destination);
  const unis = (await safe(listActiveUniversities())) ?? [];
  const destUni = matchActiveUniversity(destination, unis);
  const originUni = matchActiveUniversity(origin, unis);

  const lane = e.travellerType;
  let route: BookableRoute | null = null;
  if (lane !== "general") {
    if (destUni && originDistrict) route = await safe(findStudentRoute(originDistrict, destUni.id, "to_university"));
    if (!route && originUni && destDistrict) route = await safe(findStudentRoute(destDistrict, originUni.id, "from_university"));
  }
  if (!route && originDistrict && destDistrict) route = await safe(findGeneralRoute(originDistrict, destDistrict));

  if (!route || !route.priced) {
    return { outcome: "no_route", origin, destination: destUni ? destUni.name : (route ? route.label : destination) };
  }

  const draft: BookingDraft = {
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
  };

  let dateLabel: string | null = null;
  if (e.travelDate) {
    const d = resolveTravelDate(e.travelDate);
    if (d.ok) { draft.travelDate = d.iso; dateLabel = d.label; }
  }
  if (e.passengerName) draft.name = e.passengerName.slice(0, 80);

  return { outcome: "ready", draft, dateLabel };
}
