import type { Metadata } from "next";
import Home from "../page";
import { MALAWI_DISTRICTS, MALAWI_PUBLIC_UNIVERSITIES } from "@/lib/tripSearchData";

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

  const departure = MALAWI_DISTRICTS.includes(requestedDeparture as (typeof MALAWI_DISTRICTS)[number])
    ? requestedDeparture
    : "";
  const university = MALAWI_PUBLIC_UNIVERSITIES.includes(requestedUniversity as (typeof MALAWI_PUBLIC_UNIVERSITIES)[number])
    ? requestedUniversity
    : "";
  const travelDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : undefined;
  const seats = Number.isInteger(requestedSeats) && requestedSeats >= 1 && requestedSeats <= 10 ? requestedSeats : undefined;
  const initialTrip = departure && university
    ? {
        destination: `${departure} - ${university}`,
        travelDate,
        seats,
      }
    : undefined;

  return <Home initialTrip={initialTrip} />;
}
