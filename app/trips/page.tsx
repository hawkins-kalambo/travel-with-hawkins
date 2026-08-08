import type { Metadata } from "next";
import TripsClient from "./TripsClient";
import { MALAWI_DISTRICTS } from "@/lib/tripSearchData";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isJourneyDirection } from "@/lib/journeyDirection";

export const metadata: Metadata = {
  title: "Search Student Trips",
  description: "Search student transport from any Malawi district to Malawi's public universities.",
  alternates: {
    canonical: "/trips",
  },
};

type TripsPageProps = {
  searchParams: Promise<{
    departure?: string | string[];
    university?: string | string[];
    date?: string | string[];
    seats?: string | string[];
    direction?: string | string[];
  }>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function TripsPage({ searchParams }: TripsPageProps) {
  const params = await searchParams;
  const requestedDeparture = firstValue(params.departure);
  const requestedUniversity = firstValue(params.university);
  const requestedSeats = Number(firstValue(params.seats));
  const requestedDirection = firstValue(params.direction);

  const departure = MALAWI_DISTRICTS.includes(requestedDeparture as (typeof MALAWI_DISTRICTS)[number])
    ? requestedDeparture
    : "";
  const { data: activeUniversities } = await supabaseAdmin
    .from("universities")
    .select("name")
    .eq("status", "active")
    .order("name", { ascending: true });

  const universities = (activeUniversities ?? []).map((row) => String(row.name));
  const university = universities.includes(requestedUniversity) ? requestedUniversity : "";

  return (
    <TripsClient
      initialDeparture={departure}
      initialUniversity={university}
      initialDate={firstValue(params.date)}
      initialSeats={Number.isInteger(requestedSeats) && requestedSeats >= 1 && requestedSeats <= 10 ? requestedSeats : 1}
      initialDirection={isJourneyDirection(requestedDirection) ? requestedDirection : "to_university"}
      universities={universities}
    />
  );
}

