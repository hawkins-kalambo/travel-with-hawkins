"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { IconTicket } from "../Icon";

const HERO_WALLPAPERS = [
  { src: "/hero.png", position: "object-[68%_center] sm:object-[62%_center] lg:object-center" },
  { src: "/images/hero/hero1.jpg", position: "object-center" },
  { src: "/images/hero/hero3.jpg", position: "object-[42%_center] sm:object-center" },
  { src: "/images/hero/hero6.jpg", position: "object-[72%_center] sm:object-[65%_center] lg:object-center" },
];

const TEAM_AVATARS = [
  { src: "/images/team/Mwira.jpeg", alt: "Mwira Mukumbwa, Travel With Hawkins team member" },
  { src: "/images/team/hawkins.jpeg", alt: "Hawkins Kalambo, Travel With Hawkins team member" },
  { src: "/images/team/joshua.jpg", alt: "Joshua Kalambo, Travel With Hawkins team member" },
];

type HeroSectionProps = {
  onOpenBooking: () => void;
};

export default function HeroSection({ onOpenBooking }: HeroSectionProps) {
  const [heroIndex, setHeroIndex] = useState(0);
  const heroCount = HERO_WALLPAPERS.length;

  useEffect(() => {
    const slider = setInterval(() => {
      setHeroIndex((current) => (current + 1) % heroCount);
    }, 5500);
    return () => clearInterval(slider);
  }, [heroCount]);

  return (
    <section className="relative isolate overflow-hidden bg-navy-midnight text-white">
      {HERO_WALLPAPERS.map(({ src, position }, index) => (
        <Image
          key={src}
          src={src}
          fill
          priority={index === 0}
          sizes="100vw"
          className={`object-cover ${position} transition-opacity duration-1000 ease-in-out ${index === heroIndex ? "opacity-100" : "opacity-0"}`}
          alt=""
        />
      ))}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(11,25,49,0.78)_0%,rgba(11,25,49,0.55)_48%,rgba(11,25,49,0.88)_100%)] sm:bg-[linear-gradient(90deg,rgba(11,25,49,0.94)_0%,rgba(11,25,49,0.7)_48%,rgba(11,25,49,0.22)_100%)]" />
      <div className="relative mx-auto flex max-w-7xl px-4 pb-14 pt-14 sm:px-8 sm:pb-16 sm:pt-20 lg:min-h-[560px] lg:items-center lg:pb-20 lg:pt-24">
        <div className="w-full max-w-[780px]">
          <p className="mb-4 inline-flex rounded-full border border-orange/40 bg-navy-midnight/40 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-orange backdrop-blur-sm sm:mb-5 sm:text-xs sm:tracking-[0.22em]">
            Safe. Reliable. Student Friendly
          </p>
          <h1 className="max-w-[780px] text-[clamp(2.25rem,6vw,5rem)] font-black leading-[1.02] tracking-[-0.035em]">
            <span className="block text-white lg:whitespace-nowrap">Book Your Journey Home,</span>
            <span className="mt-1 block text-orange">The Smart Way</span>
          </h1>
          <p className="mt-4 max-w-[620px] text-base font-semibold leading-7 text-white/90 sm:mt-5 sm:text-lg lg:text-xl">
            Connecting university students with trusted bus operators across Malawi.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:mt-7 sm:flex-row sm:flex-wrap sm:gap-4">
            <button
              onClick={onOpenBooking}
              className="min-h-12 w-full rounded-full bg-orange px-7 py-3.5 text-sm font-black text-white shadow-lg shadow-navy-midnight/40 transition hover:-translate-y-0.5 hover:bg-orange-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange/50 sm:w-auto sm:px-8"
            >
              Book Trip
            </button>
            <a
              href="#routes"
              className="inline-flex min-h-12 w-full items-center justify-center rounded-full border border-white/70 bg-white/5 px-7 py-3.5 text-center text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/50 sm:w-auto sm:px-8"
            >
              Explore Routes
            </a>
          </div>
          <div className="mt-5 flex max-w-2xl items-start gap-2.5 text-sm font-medium leading-6 text-white/80 sm:items-center sm:text-base">
            <IconTicket className="mt-0.5 h-5 w-5 shrink-0 text-orange sm:mt-0" title="Booking information" />
            <p>Book your trip directly and manage your journey later when the experience is ready.</p>
          </div>
          <div className="mt-5 inline-flex max-w-full items-center gap-3 rounded-2xl border border-white/15 bg-slate-950/30 px-3.5 py-2.5 shadow-lg shadow-slate-950/10 backdrop-blur-sm sm:mt-6 sm:px-4 sm:py-3">
            <div className="flex -space-x-2">
              {TEAM_AVATARS.map((profile) => (
                <Image key={profile.src} src={profile.src} width={40} height={40} className="h-10 w-10 rounded-full border-2 border-white object-cover shadow-sm" alt={profile.alt} />
              ))}
            </div>
            <div className="min-w-0 text-sm leading-tight">
              <span className="text-lg tracking-[0.08em] text-amber-400" aria-label="Five out of five stars">★★★★★</span>
              <p className="mt-0.5 text-white/90">
                Trusted by <span className="font-black text-white">5,000+</span> Students
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
