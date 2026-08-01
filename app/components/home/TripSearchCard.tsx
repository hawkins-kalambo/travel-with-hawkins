"use client";

import { type FormEvent, type Ref } from "react";
import { IconSearch } from "../Icon";
import { MALAWI_DISTRICTS, MALAWI_PUBLIC_UNIVERSITIES } from "@/lib/tripSearchData";

type TripSearchCardProps = {
  formRef: Ref<HTMLFormElement>;
  departureSelectRef: Ref<HTMLSelectElement>;
  departureDistrict: string;
  onDepartureChange: (value: string) => void;
  destinationUniversity: string;
  onDestinationChange: (value: string) => void;
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
        className="w-full -translate-y-10 rounded-2xl border border-slate-100 bg-white p-4 text-[#101815] shadow-[0_22px_60px_rgba(2,8,23,0.18)] sm:-translate-y-14 sm:p-5"
      >
        <div className="mb-3 flex gap-5 border-b border-slate-100 pb-1 text-[11px] font-black uppercase tracking-[0.12em]">
          <button type="button" className="border-b-2 border-[#0f3f78] pb-2 text-[#0f3f78]">One Way</button>
          <button type="button" className="pb-2 text-slate-400">Round Trip</button>
        </div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-[1fr_1.25fr_0.82fr_0.65fr_auto] lg:items-end">
          <label className="block text-sm font-bold text-slate-700">
            <span className="mb-1.5 block text-xs">Departure</span>
            <select
              ref={departureSelectRef}
              required
              className="template-input"
              value={departureDistrict}
              onChange={(event) => onDepartureChange(event.target.value)}
            >
              <option value="">Select departure district</option>
              {MALAWI_DISTRICTS.map((district) => (
                <option key={district} value={district}>{district}</option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-bold text-slate-700">
            <span className="mb-1.5 block text-xs">Destination</span>
            <select
              required
              className="template-input"
              value={destinationUniversity}
              onChange={(event) => onDestinationChange(event.target.value)}
            >
              <option value="">Select destination university</option>
              {MALAWI_PUBLIC_UNIVERSITIES.map((university) => (
                <option key={university} value={university}>{university}</option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-bold text-slate-700">
            <span className="mb-1.5 block text-xs">Travel date</span>
            <input className="template-input" type="date" value={travelDate} min={today} onChange={(e) => onDateChange(e.target.value)} />
          </label>

          <label className="block text-sm font-bold text-slate-700">
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
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#0f3f78] px-5 text-sm font-black text-white transition hover:bg-[#0a2d56] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 disabled:cursor-not-allowed disabled:bg-slate-300 md:col-span-2 lg:col-span-1"
          >
            <IconSearch className="h-4 w-4" />
            Search Trips
          </button>
        </div>
        {!searchReady && (
          <p className="mt-3 text-xs text-slate-500" aria-live="polite">
            Select both a departure district and destination university to continue.
          </p>
        )}
      </form>
    </div>
  );
}
