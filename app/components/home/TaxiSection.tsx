"use client";

import { useEffect, useState } from "react";
import { formatMwk } from "@/lib/currency";
import { IconArrowRight } from "../Icon";

export type TaxiFare = {
  id: string;
  originLabel: string;
  destinationLabel: string;
  fare: number;
  operatorId: string;
  operatorDisplayName: string;
};

type TaxiSectionProps = {
  onBookFare: (fare: TaxiFare) => void;
};

export default function TaxiSection({ onBookFare }: TaxiSectionProps) {
  const [fares, setFares] = useState<TaxiFare[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(async () => {
      try {
        const res = await fetch("/api/taxi-fares", { cache: "no-store" });
        const data = await res.json();
        if (data?.success) setFares(data.taxiFares);
      } catch {
        // No taxi fares yet is a normal state, not an error worth surfacing.
      } finally {
        setLoaded(true);
      }
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  if (!loaded || fares.length === 0) return null;

  return (
    <section id="taxi" className="scroll-mt-24 bg-white px-4 py-12 sm:py-16">
      <div className="mx-auto max-w-7xl">
        <div className="mb-5">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-orange">Taxi</p>
          <h2 className="mt-1 text-2xl font-black text-navy sm:text-3xl">Book a taxi trip</h2>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {fares.map((fare) => (
            <article key={fare.id} className="flex flex-col justify-between rounded-2xl border border-border-light bg-[#f8fafc] p-4 shadow-sm transition hover:-translate-y-1 hover:border-orange/40 hover:shadow-lg">
              <div>
                <h3 className="flex items-center gap-1.5 text-sm font-black leading-5 text-navy">
                  <span className="truncate">{fare.originLabel}</span>
                  <IconArrowRight className="h-3.5 w-3.5 shrink-0 text-orange" title="Taxi trip" />
                  <span className="truncate">{fare.destinationLabel}</span>
                </h3>
                <p className="mt-1 truncate text-[11px] text-slate-500">{fare.operatorDisplayName}</p>
                <p className="mt-1 text-xs font-black text-navy">{formatMwk(fare.fare)}</p>
              </div>
              <button
                onClick={() => onBookFare(fare)}
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
