import type { Metadata } from "next";
import TripsClient from "./TripsClient";
import { MALAWI_DISTRICTS, MALAWI_PUBLIC_UNIVERSITIES } from "@/lib/tripSearchData";

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

  const departure = MALAWI_DISTRICTS.includes(requestedDeparture as (typeof MALAWI_DISTRICTS)[number])
    ? requestedDeparture
    : "";
  const university = MALAWI_PUBLIC_UNIVERSITIES.includes(requestedUniversity as (typeof MALAWI_PUBLIC_UNIVERSITIES)[number])
    ? requestedUniversity
    : "";

  return (
    <TripsClient
      initialDeparture={departure}
      initialUniversity={university}
      initialDate={firstValue(params.date)}
      initialSeats={Number.isInteger(requestedSeats) && requestedSeats >= 1 && requestedSeats <= 10 ? requestedSeats : 1}
    />
  );
}

