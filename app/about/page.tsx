import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import WhatsAppButton from "../components/WhatsAppButton";
import SiteFooter from "../components/home/SiteFooter";
import TeamSection from "../components/home/TeamSection";
import {
  IconArrowRight,
  IconBus,
  IconCheck,
  IconHeadset,
  IconMapPin,
  IconRoute,
  IconShield,
  IconUsers,
} from "../components/Icon";

export const metadata: Metadata = {
  title: "About Travel with Hawkins",
  description: "Meet the team building safer, simpler university student transport across Malawi.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About Travel with Hawkins",
    description: "Student-focused transport built for safer, simpler journeys across Malawi.",
    images: ["/images/hero/hero1.jpg"],
  },
};

const VALUES = [
  {
    title: "Safety before everything",
    description: "Clear trip details, trusted operators and accountable booking records help students travel with confidence.",
    icon: IconShield,
  },
  {
    title: "Built around students",
    description: "From district pickup points to campus arrivals, every journey is designed around real student travel needs.",
    icon: IconUsers,
  },
  {
    title: "Reliable operations",
    description: "Structured routes, booking updates and responsive support keep travellers informed from booking to arrival.",
    icon: IconRoute,
  },
  {
    title: "Support that feels human",
    description: "Our team stays reachable by phone, email and WhatsApp whenever a traveller needs help.",
    icon: IconHeadset,
  },
];

const JOURNEY_STEPS = [
  { number: "01", title: "Choose your journey", description: "Select your home district, university, travel direction and date." },
  { number: "02", title: "Book with clarity", description: "Review the route, pickup point and fare before confirming your seat." },
  { number: "03", title: "Travel with support", description: "Track your booking and reach the team if your plans or trip details change." },
];

function AboutHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border-light bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-[74px] max-w-7xl items-center justify-between px-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange/30">
          <Image src="/logo.png" width={54} height={54} className="h-12 w-12 object-contain" alt="Travel with Hawkins logo" />
          <span className="leading-none">
            <span className="block text-2xl font-black text-navy">Travel</span>
            <span className="block text-xs font-semibold text-navy-secondary">with Hawkins</span>
          </span>
        </Link>
        <nav aria-label="About page navigation" className="hidden items-center gap-7 text-sm font-bold md:flex">
          <Link href="/" className="text-slate-700 transition hover:text-orange">Home</Link>
          <Link href="/trips" className="text-slate-700 transition hover:text-orange">Trips</Link>
          <Link href="/about" aria-current="page" className="text-orange">About</Link>
          <Link href="/contact" className="text-slate-700 transition hover:text-orange">Contact</Link>
        </nav>
        <Link href="/book" className="inline-flex min-h-11 items-center justify-center rounded-full bg-orange px-5 py-2 text-sm font-black text-white shadow-sm transition hover:bg-orange-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange/30">
          Book a trip
        </Link>
      </div>
    </header>
  );
}

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <AboutHeader />
      <main>
        <section className="relative isolate overflow-hidden bg-navy-midnight text-white">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_10%,rgba(247,147,30,0.24),transparent_35%),radial-gradient(circle_at_85%_70%,rgba(64,146,223,0.2),transparent_40%)]" />
          <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-24">
            <div>
              <p className="inline-flex rounded-full border border-orange/40 bg-orange/10 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-orange">Student journeys, thoughtfully organised</p>
              <h1 className="mt-6 max-w-3xl text-4xl font-black leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
                Making university travel feel <span className="text-orange">simpler and safer.</span>
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
                Travel with Hawkins connects university students with organised transport across Malawi—bringing routes, pickup points, bookings and support into one dependable experience.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/book" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-orange px-6 py-3 text-sm font-black text-white transition hover:bg-orange-hover">Find your trip <IconArrowRight className="h-4 w-4" /></Link>
                <Link href="/ambassador/apply" className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/20 bg-white/5 px-6 py-3 text-sm font-black text-white transition hover:bg-white/10">Become an ambassador</Link>
              </div>
            </div>
            <div className="relative mx-auto w-full max-w-xl">
              <div className="absolute -left-5 -top-5 h-24 w-24 rounded-full border border-orange/30 bg-orange/10" />
              <div className="relative aspect-[4/3] overflow-hidden rounded-[32px] border border-white/15 shadow-2xl shadow-black/30">
                <Image src="/images/hero/hero1.jpg" alt="Students travelling with Travel with Hawkins" fill priority sizes="(max-width: 1024px) 100vw, 45vw" className="object-cover" />
                <div className="absolute inset-0 bg-linear-to-t from-navy-midnight/80 via-transparent to-transparent" />
                <div className="absolute inset-x-5 bottom-5 rounded-2xl border border-white/15 bg-navy-midnight/75 p-4 backdrop-blur-md sm:inset-x-7 sm:bottom-7">
                  <div className="flex items-center gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-orange text-white"><IconBus className="h-6 w-6" /></span>
                    <div>
                      <p className="font-black text-white">Safe journeys. Trusted service.</p>
                      <p className="mt-1 text-xs text-slate-300">From home districts to university—and back again.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 py-16 sm:px-8 sm:py-20">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div className="relative overflow-hidden rounded-[30px] bg-orange-soft p-7 sm:p-9">
              <div className="absolute right-0 top-0 h-36 w-36 translate-x-12 -translate-y-12 rounded-full bg-orange/15" />
              <p className="text-xs font-black uppercase tracking-[0.2em] text-orange">Why we exist</p>
              <h2 className="mt-3 text-3xl font-black leading-tight text-navy sm:text-4xl">Student transport should not feel uncertain.</h2>
              <p className="mt-5 leading-7 text-slate-700">Travelling between home and campus often involves scattered information, unclear pickup arrangements and last-minute coordination. We are building a more organised way to move.</p>
              <div className="mt-7 flex items-start gap-3 rounded-2xl bg-white p-4 shadow-sm">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-navy text-white"><IconMapPin className="h-5 w-5" /></span>
                <p className="text-sm leading-6 text-slate-700">Clear district and campus pickup points make every direction of the journey easier to understand.</p>
              </div>
            </div>
            <div className="lg:pl-8">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-orange">Our mission</p>
              <h2 className="mt-3 text-3xl font-black leading-tight text-navy sm:text-4xl">A trusted transport network built around university life.</h2>
              <p className="mt-5 text-base leading-8 text-slate-600">Our mission is to make intercity student travel across Malawi easier to plan, book and manage. We combine local route knowledge with a digital booking system that keeps students, ambassadors and transport teams connected.</p>
              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                {["Student-focused route planning", "Two-way campus journeys", "Transparent booking records", "University-level operations"].map((item) => (
                  <div key={item} className="flex items-center gap-3 rounded-xl border border-border-light bg-white p-3 text-sm font-bold text-slate-700">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-700"><IconCheck className="h-4 w-4" /></span>{item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-border-light bg-slate-50 px-4 py-16 sm:px-8 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-orange">What guides us</p>
              <h2 className="mt-3 text-3xl font-black text-navy sm:text-4xl">Principles behind every journey</h2>
              <p className="mt-4 leading-7 text-slate-600">Technology matters, but trust is what makes a travel service work.</p>
            </div>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {VALUES.map(({ title, description, icon: Icon }) => (
                <article key={title} className="rounded-[24px] border border-border-light bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-orange-soft text-orange"><Icon className="h-6 w-6" /></span>
                  <h3 className="mt-5 text-lg font-black text-navy">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-16 sm:px-8 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-orange">The experience</p>
                <h2 className="mt-3 text-3xl font-black text-navy sm:text-4xl">From search to seat in three clear steps.</h2>
              </div>
              <p className="max-w-2xl text-base leading-7 text-slate-600 lg:justify-self-end">The platform brings the decisions students care about most—where to board, where they are going, what it costs and who to contact—into one journey.</p>
            </div>
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {JOURNEY_STEPS.map((step) => (
                <article key={step.number} className="relative overflow-hidden rounded-[24px] bg-navy p-6 text-white">
                  <span className="absolute right-4 top-1 text-6xl font-black text-white/5">{step.number}</span>
                  <span className="text-xs font-black uppercase tracking-[0.25em] text-orange">Step {step.number}</span>
                  <h3 className="mt-6 text-xl font-black">{step.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-300">{step.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="overflow-hidden bg-navy-midnight px-4 py-16 text-white sm:px-8 sm:py-20">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-orange">Growing with Malawi&apos;s universities</p>
              <h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">One platform, locally managed for every campus.</h2>
              <p className="mt-5 max-w-xl leading-7 text-slate-300">Travel with Hawkins is designed to expand university by university. Each campus can have its own routes, fares, pickup points, ambassadors and authorised operations team while the central team maintains service standards across the network.</p>
              <Link href="/trips" className="mt-7 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-black text-navy transition hover:bg-orange-soft">Explore available trips <IconArrowRight className="h-4 w-4" /></Link>
            </div>
            <div className="relative aspect-[16/11] overflow-hidden rounded-[30px] border border-white/10">
              <Image src="/images/hero/hero6.jpg" alt="University students preparing for a journey" fill sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" />
              <div className="absolute inset-0 bg-linear-to-t from-navy-midnight/65 to-transparent" />
            </div>
          </div>
        </section>

        <TeamSection />

        <section className="px-4 pb-16 pt-6 sm:px-8 sm:pb-20">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 overflow-hidden rounded-[30px] bg-orange px-7 py-9 text-white shadow-xl shadow-orange/20 sm:px-10 md:flex-row md:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-white/75">Ready when you are</p>
              <h2 className="mt-2 text-2xl font-black sm:text-3xl">Let&apos;s make your next campus journey easier.</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/85">Search available routes or talk to our team if you need help planning your trip.</p>
            </div>
            <div className="flex w-full shrink-0 flex-col gap-3 sm:w-auto sm:flex-row">
              <Link href="/contact" className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/35 px-5 py-3 text-sm font-black text-white transition hover:bg-white/10">Contact us</Link>
              <Link href="/book" className="inline-flex min-h-12 items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-black text-navy transition hover:bg-orange-soft">Book a trip</Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
      <WhatsAppButton />
    </div>
  );
}
