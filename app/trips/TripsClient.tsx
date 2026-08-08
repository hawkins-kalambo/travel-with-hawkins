"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import WhatsAppButton from "../components/WhatsAppButton";
import { IconRoute, IconSearch } from "../components/Icon";
import { MALAWI_DISTRICTS } from "@/lib/tripSearchData";
import { getJourneyEndpoints, type JourneyDirection } from "@/lib/journeyDirection";

type TripsClientProps = {
  initialDeparture: string;
  initialUniversity: string;
  initialDate: string;
  initialSeats: number;
  universities: string[];
  initialDirection: JourneyDirection;
};

type SearchedTrip = {
  departure: string;
  university: string;
  date: string;
  seats: number;
  direction: JourneyDirection;
};

export default function TripsClient({
  initialDeparture,
  initialUniversity,
  initialDate,
  initialSeats,
  universities,
  initialDirection,
}: TripsClientProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [departure, setDeparture] = useState(initialDeparture);
  const [university, setUniversity] = useState(initialUniversity);
  const [travelDate, setTravelDate] = useState(initialDate);
  const [seats, setSeats] = useState(initialSeats);
  const [direction, setDirection] = useState<JourneyDirection>(initialDirection);
  const [searchedTrip, setSearchedTrip] = useState<SearchedTrip | null>(
    initialDeparture && initialUniversity
      ? { departure: initialDeparture, university: initialUniversity, date: initialDate, seats: initialSeats, direction: initialDirection }
      : null
  );
  const searchReady = Boolean(departure && university);
  const today = new Date().toISOString().split("T")[0];

  const updateDeparture = (value: string) => {
    setDeparture(value);
    setSearchedTrip(null);
  };

  const updateUniversity = (value: string) => {
    setUniversity(value);
    setSearchedTrip(null);
  };

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!searchReady) return;

    const result = { departure, university, date: travelDate, seats, direction };
    setSearchedTrip(result);

    const params = new URLSearchParams({ departure, university, direction, seats: String(seats) });
    if (travelDate) params.set("date", travelDate);
    router.replace(`/trips?${params.toString()}`, { scroll: false });
  };

  const bookingParams = searchedTrip
    ? new URLSearchParams({
        departure: searchedTrip.departure,
        university: searchedTrip.university,
        direction: searchedTrip.direction,
        ...(searchedTrip.date ? { date: searchedTrip.date } : {}),
        seats: String(searchedTrip.seats),
      }).toString()
    : "";

  return (
    <main className="min-h-screen bg-[#f4f8fd] text-[#101815]">
      <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-[74px] max-w-7xl items-center justify-between px-4 sm:px-8">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.png" width={54} height={54} className="h-12 w-12 object-contain" alt="Travel With Hawkins logo" />
            <div>
              <div className="text-2xl font-black leading-none text-[#0f3f78]">Travel</div>
              <div className="text-xs font-semibold leading-none">with Hawkins</div>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <nav className="hidden items-center gap-6 text-sm font-bold lg:flex" aria-label="Primary navigation">
              <Link href="/" className="text-slate-700 transition hover:text-[#0f3f78]">Home</Link>
              <Link href="/trips" aria-current="page" className="text-[#0f3f78]">Trips</Link>
              <Link href="/#routes" className="text-slate-700 transition hover:text-[#0f3f78]">Routes</Link>
              <Link href="/#help-center" className="text-slate-700 transition hover:text-[#0f3f78]">Support</Link>
            </nav>
            <Link href="/book" className="rounded-full bg-[#0f3f78] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#0a2d56]">
              Book Trip
            </Link>
            <button
              type="button"
              onClick={() => setMenuOpen((current) => !current)}
              className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white lg:hidden"
              aria-label="Toggle navigation menu"
              aria-expanded={menuOpen}
            >
              <span className="flex w-5 flex-col gap-1">
                <span className="h-0.5 rounded bg-[#101815]" />
                <span className="h-0.5 rounded bg-[#101815]" />
                <span className="h-0.5 rounded bg-[#101815]" />
              </span>
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav className="border-t border-slate-100 bg-white px-4 py-3 lg:hidden" aria-label="Mobile navigation">
            {[
              ["Home", "/"],
              ["Trips", "/trips"],
              ["Routes", "/#routes"],
              ["Support", "/#help-center"],
            ].map(([label, href]) => (
              <Link
                key={label}
                href={href}
                onClick={() => setMenuOpen(false)}
                aria-current={label === "Trips" ? "page" : undefined}
                className={`block rounded-md px-3 py-2 text-sm font-bold ${label === "Trips" ? "bg-blue-50 text-[#0f3f78]" : "text-slate-700 hover:bg-blue-50"}`}
              >
                {label}
              </Link>
            ))}
          </nav>
        )}
      </header>

      <section className="bg-[#071f3d] px-4 py-14 text-white sm:px-8 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-sky-300">Trips</p>
          <h1 className="mt-3 max-w-3xl text-[clamp(2.4rem,6vw,4.5rem)] font-black leading-[1.04] tracking-[-0.035em]">
            Find your student trip
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-blue-100 sm:text-lg">
            Choose whether you are going home or going to university, then select your district and campus.
          </p>
        </div>
      </section>

      <section className="px-4 py-10 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <form onSubmit={handleSearch} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xl sm:p-7">
            <fieldset className="mb-5">
              <legend className="mb-2 text-sm font-bold text-slate-700">Where are you travelling?</legend>
              <div className="grid max-w-md grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
                {([["to_university", "Going to university"], ["from_university", "Going home"]] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={direction === value}
                    onClick={() => { setDirection(value); setSearchedTrip(null); }}
                    className={`min-h-11 rounded-lg px-3 text-xs font-black transition ${direction === value ? "bg-white text-[#0f3f78] shadow-sm" : "text-slate-600"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-5 lg:grid-cols-[1fr_1.35fr_0.8fr_0.65fr_auto] lg:items-end">
              <label className="block text-sm font-bold text-slate-700">
                <span className="mb-2 block">{direction === "from_university" ? "To home district" : "From home district"}</span>
                <select required className="template-input" value={departure} onChange={(event) => updateDeparture(event.target.value)}>
                  <option value="">Select home district</option>
                  {MALAWI_DISTRICTS.map((district) => <option key={district} value={district}>{district}</option>)}
                </select>
              </label>

              <label className="block text-sm font-bold text-slate-700">
                <span className="mb-2 block">{direction === "from_university" ? "From university" : "To university"}</span>
                <select required className="template-input" value={university} onChange={(event) => updateUniversity(event.target.value)}>
                  <option value="">Select university</option>
                  {universities.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>

              <label className="block text-sm font-bold text-slate-700">
                <span className="mb-2 block">Travel date</span>
                <input className="template-input" type="date" min={today} value={travelDate} onChange={(event) => setTravelDate(event.target.value)} />
              </label>

              <label className="block text-sm font-bold text-slate-700">
                <span className="mb-2 block">Passengers</span>
                <select className="template-input" value={seats} onChange={(event) => setSeats(Number(event.target.value))}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((count) => (
                    <option key={count} value={count}>{count}</option>
                  ))}
                </select>
              </label>

              <button
                type="submit"
                disabled={!searchReady}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-[#0f3f78] px-6 text-sm font-black text-white transition hover:bg-[#0a2d56] disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <IconSearch className="h-4 w-4" />
                Search Trips
              </button>
            </div>
            {!searchReady && (
              <p className="mt-4 text-sm text-slate-500" aria-live="polite">
                Select both your home district and university to continue.
              </p>
            )}
          </form>

          {searchedTrip && (
            <article className="mt-8 overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-sm">
              <div className="grid gap-6 p-6 md:grid-cols-[auto_1fr_auto] md:items-center md:p-8">
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-[#0f3f78]">
                  <IconRoute className="h-7 w-7" title="Customized route" />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0f3f78]">Customized route</p>
                  <h2 className="mt-1 text-xl font-black text-slate-900">
                    {(() => {
                      const endpoints = getJourneyEndpoints(searchedTrip.departure, searchedTrip.university, searchedTrip.direction);
                      return `${endpoints.origin} to ${endpoints.destination}`;
                    })()}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {searchedTrip.date ? `Travel date: ${searchedTrip.date}. ` : ""}
                    {searchedTrip.seats} passenger{searchedTrip.seats === 1 ? "" : "s"}. Submit a booking request and our team will confirm availability and fare.
                  </p>
                </div>
                <Link
                  href={`/book?${bookingParams}`}
                  className="rounded-full bg-[#0f3f78] px-6 py-3 text-center text-sm font-black text-white transition hover:bg-[#0a2d56]"
                >
                  Book this trip
                </Link>
              </div>
            </article>
          )}
        </div>
      </section>

      <WhatsAppButton />
    </main>
  );
}
