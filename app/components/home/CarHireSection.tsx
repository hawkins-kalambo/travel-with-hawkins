"use client";

import { useEffect, useState } from "react";
import { formatMwk } from "@/lib/currency";

export type CarHireListing = {
  id: string;
  dailyRate: number;
  driverIncluded: boolean;
  operatorId: string;
  operatorDisplayName: string;
  vehicleLabel: string;
  capacity: number | null;
};

type CarHireSectionProps = {
  onBookListing: (listing: CarHireListing) => void;
};

export default function CarHireSection({ onBookListing }: CarHireSectionProps) {
  const [listings, setListings] = useState<CarHireListing[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(async () => {
      try {
        const res = await fetch("/api/car-hire-listings", { cache: "no-store" });
        const data = await res.json();
        if (data?.success) setListings(data.carHireListings);
      } catch {
        // No listings yet is a normal state, not an error worth surfacing.
      } finally {
        setLoaded(true);
      }
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  if (!loaded || listings.length === 0) return null;

  return (
    <section id="car-hire" className="scroll-mt-24 bg-navy-midnight px-4 py-12 sm:py-16">
      <div className="mx-auto max-w-7xl">
        <div className="mb-5">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-orange">Car Hire</p>
          <h2 className="mt-1 text-2xl font-black text-white sm:text-3xl">Hire a car by the day</h2>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => (
            <article key={listing.id} className="flex flex-col justify-between rounded-2xl border border-border-light bg-white p-4 shadow-sm transition hover:-translate-y-1 hover:border-orange/40 hover:shadow-lg">
              <div>
                <h3 className="text-sm font-black leading-5 text-navy">{listing.vehicleLabel}</h3>
                <p className="mt-1 truncate text-[11px] text-slate-500">
                  {listing.operatorDisplayName} · {listing.driverIncluded ? "Driver included" : "Self-drive"}
                  {listing.capacity ? ` · ${listing.capacity} seats` : ""}
                </p>
                <p className="mt-1 text-xs font-black text-navy">{formatMwk(listing.dailyRate)}/day</p>
              </div>
              <button
                onClick={() => onBookListing(listing)}
                className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg border border-navy/25 px-3 py-2 text-xs font-black text-navy transition hover:bg-orange hover:border-orange hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange/30"
              >
                Book Now
              </button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
