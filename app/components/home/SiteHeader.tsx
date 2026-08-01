"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

const NAV_LINKS: Array<[string, string]> = [
  ["Home", "/"],
  ["Trips", "/trips"],
  ["Routes", "/#routes"],
  ["Customize", "/#customize"],
  ["How It Works", "/#how-it-works"],
  ["Support", "/#help-center"],
];

type SiteHeaderProps = {
  onOpenBooking: () => void;
  onOpenTrack: () => void;
};

export default function SiteHeader({ onOpenBooking, onOpenTrack }: SiteHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-[74px] max-w-7xl items-center justify-between px-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/logo.png" width={54} height={54} className="h-12 w-12 object-contain" alt="Travel With Hawkins logo" />
          <div>
            <div className="text-2xl font-black leading-none text-[#0f3f78]">Travel</div>
            <div className="text-xs font-semibold leading-none">with Hawkins</div>
          </div>
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-bold lg:flex">
          {NAV_LINKS.map(([item, href]) => (
            <Link key={item} href={href} className="text-slate-700 transition hover:text-[#0f3f78]">
              {item}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={onOpenTrack}
            className="hidden min-h-11 items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-white sm:inline-flex"
          >
            Track Booking
          </button>
          <Link
            href="/customer/login"
            className="hidden min-h-11 items-center rounded-full border border-[#0f3f78] px-4 py-2 text-sm font-bold text-[#0f3f78] transition hover:bg-blue-50 lg:inline-flex"
          >
            Sign In
          </Link>
          <button
            onClick={onOpenBooking}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#0f3f78] px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#0a2d56]"
          >
            Book Trip
          </button>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white lg:hidden"
            aria-label="Menu"
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
        <div className="border-t border-slate-100 bg-white px-4 py-3 lg:hidden">
          {NAV_LINKS.map(([item, href]) => (
            <Link key={item} href={href} onClick={() => setMenuOpen(false)} className="block rounded-md px-3 py-2 text-sm font-bold hover:bg-blue-50">
              {item}
            </Link>
          ))}
          <div className="mt-2 flex flex-col gap-2 border-t border-slate-100 pt-3">
            <Link href="/customer/login" onClick={() => setMenuOpen(false)} className="rounded-md border border-slate-200 px-3 py-2 text-center text-sm font-bold text-slate-700">
              Sign In
            </Link>
            <button
              onClick={() => {
                onOpenTrack();
                setMenuOpen(false);
              }}
              className="rounded-md border border-slate-200 px-3 py-2 text-center text-sm font-bold text-slate-700"
            >
              Track Booking
            </button>
            <button
              onClick={() => {
                onOpenBooking();
                setMenuOpen(false);
              }}
              className="rounded-md bg-[#0f3f78] px-3 py-2 text-center text-sm font-bold text-white"
            >
              Book Trip
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
