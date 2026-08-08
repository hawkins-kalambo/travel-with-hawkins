"use client";

import { type FormEvent, type Ref } from "react";
import { IconSearch } from "../Icon";
import { MALAWI_DISTRICTS } from "@/lib/tripSearchData";
import type { JourneyDirection } from "@/lib/journeyDirection";

type TripSearchCardProps = {
  formRef: Ref<HTMLFormElement>;
  departureSelectRef: Ref<HTMLSelectElement>;
  departureDistrict: string;
  onDepartureChange: (value: string) => void;
  destinationUniversity: string;
  onDestinationChange: (value: string) => void;
  journeyDirection: JourneyDirection;
  onJourneyDirectionChange: (value: JourneyDirection) => void;
  universities: string[];
  travelDate: string;
  onDateChange: (value: string) => void;
  seats: number;
  onSeatsChange: (value: number) => void;
  today: string;
  searchReady: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export default function TripSearchCard({
  formRef,
  departureSelectRef,
  departureDistrict,
  onDepartureChange,
  destinationUniversity,
  onDestinationChange,
  journeyDirection,
  onJourneyDirectionChange,
  universities,
  travelDate,
  onDateChange,
  seats,
  onSeatsChange,
  today,
  searchReady,
  onSubmit,
}: TripSearchCardProps) {
  return (
    <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-8">
      <form
        id="trip-search"
        ref={formRef}
        onSubmit={onSubmit}
        className="w-full -translate-y-10 rounded-2xl border border-border-light bg-white p-4 text-text-dark shadow-[0_22px_60px_rgba(11,25,49,0.18)] sm:-translate-y-14 sm:p-5"
      >
        <fieldset className="mb-4">
          <legend className="mb-2 text-xs font-black text-navy">Where are you travelling?</legend>
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 sm:max-w-md">
            {([
              ["to_university", "Going to university"],
              ["from_university", "Going home"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={journeyDirection === value}
                onClick={() => onJourneyDirectionChange(value)}
                className={`min-h-11 rounded-lg px-3 text-xs font-black transition ${journeyDirection === value ? "bg-white text-orange shadow-sm" : "text-slate-600 hover:text-navy"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-[1fr_1.25fr_0.82fr_0.65fr_auto] lg:items-end">
          {journeyDirection === "from_university" && (
            <label className="block text-sm font-bold text-navy">
              <span className="mb-1.5 block text-xs">From university</span>
              <select required className="template-input" value={destinationUniversity} onChange={(event) => onDestinationChange(event.target.value)}>
                <option value="">Select university</option>
                {universities.map((university) => <option key={university} value={university}>{university}</option>)}
              </select>
            </label>
          )}
          <label className="block text-sm font-bold text-navy">
            <span className="mb-1.5 block text-xs">{journeyDirection === "from_university" ? "To home district" : "From home district"}</span>
            <select
              ref={departureSelectRef}
              required
              className="template-input"
              value={departureDistrict}
              onChange={(event) => onDepartureChange(event.target.value)}
            >
              <option value="">Select home district</option>
              {MALAWI_DISTRICTS.map((district) => (
                <option key={district} value={district}>{district}</option>
              ))}
            </select>
          </label>

          {journeyDirection === "to_university" && (
            <label className="block text-sm font-bold text-navy">
              <span className="mb-1.5 block text-xs">To university</span>
              <select required className="template-input" value={destinationUniversity} onChange={(event) => onDestinationChange(event.target.value)}>
                <option value="">Select university</option>
                {universities.map((university) => <option key={university} value={university}>{university}</option>)}
              </select>
            </label>
          )}

          <label className="block text-sm font-bold text-navy">
            <span className="mb-1.5 block text-xs">Travel date</span>
            <input className="template-input" type="date" value={travelDate} min={today} onChange={(e) => onDateChange(e.target.value)} />
          </label>

          <label className="block text-sm font-bold text-navy">
            <span className="mb-1.5 block text-xs">Passengers</span>
            <select className="template-input" value={seats} onChange={(e) => onSeatsChange(Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            disabled={!searchReady}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-orange px-5 text-sm font-black text-white transition hover:bg-orange-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange/30 disabled:cursor-not-allowed disabled:bg-slate-300 md:col-span-2 lg:col-span-1"
          >
            <IconSearch className="h-4 w-4" />
            Search Trips
          </button>
        </div>
        {!searchReady && (
          <p className="mt-3 text-xs text-slate-500" aria-live="polite">
            Select both your home district and university to continue.
          </p>
        )}
      </form>
    </div>
  );
}
