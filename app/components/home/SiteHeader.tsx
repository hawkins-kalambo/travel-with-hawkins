"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconMenu, IconX } from "../Icon";

const NAV_LINKS: Array<[string, string]> = [
  ["Home", "/"],
  ["Trips", "/trips"],
  ["Routes", "/#routes"],
  ["Customize", "/#trip-search"],
  ["How It Works", "/#how-it-works"],
  ["Payment", "/payment"],
  ["Support", "/#help-center"],
];

type SiteHeaderProps = {
  onOpenBooking: () => void;
  onOpenTrack: () => void;
};

function isActiveLink(pathname: string, href: string) {
  const base = href.split("#")[0] || "/";
  if (base === "/") return pathname === "/";
  return pathname === base || pathname.startsWith(`${base}/`);
}

export default function SiteHeader({ onOpenBooking, onOpenTrack }: SiteHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname() ?? "/";

  return (
    <header className="sticky top-0 z-50 border-b border-border-light bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-[74px] max-w-7xl items-center justify-between px-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange/30">
          <Image src="/logo.png" width={54} height={54} className="h-12 w-12 object-contain" alt="Travel With Hawkins logo" />
          <div>
            <div className="text-2xl font-black leading-none text-navy">Travel</div>
            <div className="text-xs font-semibold leading-none text-navy-secondary">with Hawkins</div>
          </div>
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-bold lg:flex">
          {NAV_LINKS.map(([item, href]) => {
            const active = isActiveLink(pathname, href);
            return (
              <Link
                key={item}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`relative py-1 transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange/30 ${
                  active ? "text-navy" : "text-slate-700 hover:text-orange"
                }`}
              >
                {item}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={onOpenTrack}
            className="hidden min-h-11 items-center rounded-full border border-navy/25 bg-white px-3 py-2 text-sm font-bold text-navy transition hover:bg-orange-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange/30 sm:inline-flex"
          >
            Track Booking
          </button>
          <Link
            href="/customer/login"
            className="hidden min-h-11 items-center rounded-full border border-navy/25 px-4 py-2 text-sm font-bold text-navy transition hover:bg-orange-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange/30 lg:inline-flex"
          >
            Sign In
          </Link>
          <button
            onClick={onOpenBooking}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-orange px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-orange-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange/30"
          >
            Book Trip
          </button>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="grid h-10 w-10 place-items-center rounded-full border border-border-light bg-white text-navy transition hover:bg-orange-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange/30 lg:hidden"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <IconX className="h-5 w-5" /> : <IconMenu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="border-t border-border-light bg-white px-4 py-3 lg:hidden">
          {NAV_LINKS.map(([item, href]) => {
            const active = isActiveLink(pathname, href);
            return (
              <Link
                key={item}
                href={href}
                onClick={() => setMenuOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`block rounded-md px-3 py-2 text-sm font-bold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange/30 ${
                  active ? "bg-orange-soft text-orange" : "text-slate-700 hover:bg-orange-soft hover:text-orange"
                }`}
              >
                {item}
              </Link>
            );
          })}
          <div className="mt-2 flex flex-col gap-2 border-t border-border-light pt-3">
            <Link
              href="/customer/login"
              onClick={() => setMenuOpen(false)}
              className="rounded-md border border-navy/25 px-3 py-2 text-center text-sm font-bold text-navy focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange/30"
            >
              Sign In
            </Link>
            <button
              onClick={() => {
                onOpenTrack();
                setMenuOpen(false);
              }}
              className="rounded-md border border-navy/25 px-3 py-2 text-center text-sm font-bold text-navy focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange/30"
            >
              Track Booking
            </button>
            <button
              onClick={() => {
                onOpenBooking();
                setMenuOpen(false);
              }}
              className="rounded-md bg-orange px-3 py-2 text-center text-sm font-bold text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange/30"
            >
              Book Trip
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
