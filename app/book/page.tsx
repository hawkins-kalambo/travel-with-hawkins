import type { Metadata } from "next";
import Home from "../page";
import { MALAWI_DISTRICTS } from "@/lib/tripSearchData";
import { sanitizeReferralCode } from "@/lib/referralStorage";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildJourneyName, isJourneyDirection } from "@/lib/journeyDirection";

export const metadata: Metadata = {
  title: "Book Student Transport",
  description: "Book a scheduled route or request a custom student transport trip with Travel With Hawkins.",
  alternates: {
    canonical: "/book",
  },
};

type BookPageProps = {
  searchParams: Promise<{
    departure?: string | string[];
    university?: string | string[];
    date?: string | string[];
    seats?: string | string[];
    ref?: string | string[];
    direction?: string | string[];
  }>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function BookPage({ searchParams }: BookPageProps) {
  const params = await searchParams;
  const requestedDeparture = firstValue(params.departure);
  const requestedUniversity = firstValue(params.university);
  const requestedDate = firstValue(params.date);
  const requestedSeats = Number(firstValue(params.seats));
  const requestedDirection = firstValue(params.direction);

  const departure = MALAWI_DISTRICTS.includes(requestedDeparture as (typeof MALAWI_DISTRICTS)[number])
    ? requestedDeparture
    : "";
  const { data: activeUniversity } = requestedUniversity
    ? await supabaseAdmin
        .from("universities")
        .select("id, name")
        .eq("name", requestedUniversity)
        .eq("status", "active")
        .maybeSingle()
    : { data: null };
  const university = activeUniversity?.name ? String(activeUniversity.name) : "";
  const travelDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : undefined;
  const seats = Number.isInteger(requestedSeats) && requestedSeats >= 1 && requestedSeats <= 10 ? requestedSeats : undefined;
  const journeyDirection = isJourneyDirection(requestedDirection) ? requestedDirection : "to_university";

  // Resolves a structured route (see db/migrations/2026_08_04_universities_and_structured_routes.sql)
  // for this district/university pair, if one exists and is actually live —
  // this is what gives the district+university search flow a real fare
  // instead of falling through to the fuzzy settings-based matcher, which
  // never matches this direction. A university that isn't active yet (most
  // of the six, pre-Phase-2) or a district with no configured route simply
  // resolves nothing, and the booking falls back to today's freeform
  // custom-destination behavior — never a hard error.
  let routeId: string | undefined;
  let routeOptions: { routeId: string; label: string }[] | undefined;

  if (departure && university) {
    if (activeUniversity) {
      const { data: routeRows } = await supabaseAdmin
        .from("routes")
        .select("id, direction, pickupPoint:university_pickup_points(label, status), districtPickupPoint:district_pickup_points(label, status)")
        .eq("university_id", activeUniversity.id)
        .eq("origin_district", departure)
        .eq("direction", journeyDirection)
        .eq("status", "active");

      const options = (routeRows ?? [])
        .filter((row) => {
          const relations = row as unknown as {
            pickupPoint?: { status?: string } | null;
            districtPickupPoint?: { status?: string } | null;
          };
          return relations.districtPickupPoint?.status === "active"
            && (!relations.pickupPoint || relations.pickupPoint.status === "active");
        })
        .map((row) => {
          const relations = row as unknown as {
            pickupPoint?: { label?: string } | null;
            districtPickupPoint?: { label?: string } | null;
          };
          return {
            routeId: String(row.id),
            label: journeyDirection === "from_university"
              ? relations.pickupPoint?.label || university
              : relations.districtPickupPoint?.label || departure,
          };
        });

      if (options.length === 1) {
        routeId = options[0].routeId;
        routeOptions = options;
      } else if (options.length > 1) {
        routeOptions = options;
      }
    }
  }

  const initialTrip = departure && university
    ? {
        destination: buildJourneyName(departure, university, journeyDirection),
        travelDate,
        seats,
        routeId,
        routeOptions,
        journeyDirection,
        homeDistrict: departure,
        university,
      }
    : undefined;

  // Ambassador referral links are generated as /book?ref=CODE (see
  // app/api/ambassadors/route.ts, app/api/applications/review/route.ts).
  // Sanitized here server-side so Home never has to trust an unvalidated
  // query string value.
  const initialReferralCode = sanitizeReferralCode(firstValue(params.ref)) ?? null;

  return <Home initialTrip={initialTrip} initialReferralCode={initialReferralCode} />;
}
