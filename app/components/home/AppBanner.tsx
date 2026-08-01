import Image from "next/image";

export default function AppBanner() {
  return (
    <section className="px-4 py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 overflow-hidden rounded-3xl bg-[#071f3d] p-6 text-center text-white sm:p-10 lg:flex-row lg:text-left">
        <div className="relative h-40 w-full max-w-[220px] shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/5 lg:h-48">
          <Image src="/images/playstore.png" fill sizes="220px" className="object-cover" alt="The Travel with Hawkins app preview" />
        </div>
        <div className="flex-1">
          <span className="inline-flex rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-sky-300">Coming Soon</span>
          <h2 className="mt-2 text-2xl font-black sm:text-3xl">The Travel with Hawkins App</h2>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-300 lg:mx-0 mx-auto">
            Book trips, manage bookings and get real-time updates on the go.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3 lg:justify-start">
            <span
              aria-disabled="true"
              title="Coming soon"
              className="inline-flex min-h-11 cursor-not-allowed items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-bold text-slate-300"
            >
              Get it on Google Play
            </span>
            <span
              aria-disabled="true"
              title="Coming soon"
              className="inline-flex min-h-11 cursor-not-allowed items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-bold text-slate-300"
            >
              Download on the App Store
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
