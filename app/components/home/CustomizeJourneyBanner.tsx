import { IconCheck, IconMapPin } from "../Icon";

const CHECKLIST = ["Choose your preferred departure district", "Pick any of Malawi's public universities", "Travel on the date and time that suits you"];

type CustomizeJourneyBannerProps = {
  onCustomize: () => void;
};

export default function CustomizeJourneyBanner({ onCustomize }: CustomizeJourneyBannerProps) {
  return (
    <section id="customize" className="scroll-mt-24 px-4 py-10 sm:py-8">
      <div className="mx-auto grid max-w-6xl items-center gap-8 overflow-hidden rounded-3xl bg-[#071f3d] p-6 text-white sm:p-10 lg:grid-cols-2">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Build Your Own Trip</p>
          <h2 className="mt-1 text-2xl font-black sm:text-3xl">Customize Your Journey</h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-300">
            Build your perfect trip. Choose your route, departure district, and university destination that work for you.
          </p>
          <ul className="mt-5 space-y-2.5 text-sm">
            {CHECKLIST.map((item) => (
              <li key={item} className="flex items-start gap-2 font-medium">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-sky-400 text-[#071f3d]">
                  <IconCheck className="h-3 w-3" />
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={onCustomize}
            className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full bg-[#155ea6] px-6 text-sm font-black text-white transition hover:bg-[#1f78d1] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-300/50"
          >
            Customize Route
          </button>
        </div>

        <div className="relative hidden h-64 items-center justify-center rounded-2xl border border-white/10 bg-white/5 lg:flex" aria-hidden="true">
          <svg viewBox="0 0 320 220" className="h-full w-full" fill="none">
            <path d="M60 170 C 120 120, 140 90, 260 50" stroke="#6db7ff" strokeWidth="3" strokeDasharray="8 8" strokeLinecap="round" />
          </svg>
          <span className="absolute bottom-10 left-14 flex flex-col items-center gap-1 text-xs font-bold">
            <IconMapPin className="h-7 w-7 text-emerald-400" title="Departure" />
            Departure
          </span>
          <span className="absolute right-14 top-10 flex flex-col items-center gap-1 text-xs font-bold">
            <IconMapPin className="h-7 w-7 text-sky-300" title="University" />
            University
          </span>
        </div>
      </div>
    </section>
  );
}
