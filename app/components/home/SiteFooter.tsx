import Image from "next/image";
import Link from "next/link";
import { IconMail, IconPhone, IconWhatsApp } from "../Icon";
import { whatsappUrl } from "../WhatsAppButton";

const CONTACT_EMAIL = "contact@travelwithhawkins.com";
const CONTACT_PHONES = [
  { href: "tel:+265886470843", label: "0886 470 843" },
  { href: "tel:+265989127308", label: "0989 127 308" },
];

const QUICK_LINKS: Array<[string, string]> = [
  ["Home", "/"],
  ["Trips", "/trips"],
  ["Routes", "/#routes"],
  ["Customize", "/#trip-search"],
  ["How It Works", "/#how-it-works"],
  ["Support", "/#help-center"],
];

const COMPANY_LINKS: Array<[string, string]> = [
  ["About Us", "/about"],
  ["Contact Us", "/contact"],
  ["Terms & Conditions", "/terms"],
  ["Privacy Policy", "/privacy"],
];

export default function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer id="contact" className="scroll-mt-24 overflow-hidden border-t-2 border-orange bg-navy-midnight text-white">
      <div className="border-b border-white/10 px-4 py-6 sm:px-8">
        <div className="mx-auto grid max-w-6xl gap-3 md:grid-cols-3">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex min-h-14 items-center gap-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 transition hover:-translate-y-0.5 hover:border-emerald-300/60 hover:bg-emerald-500/20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300/40"
            aria-label="Chat with Travel With Hawkins on WhatsApp"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[#168c4b] text-white shadow-md shadow-emerald-950/25">
              <IconWhatsApp className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-sm font-black">WhatsApp</span>
              <span className="block text-xs text-muted-bluegray">Chat with us anytime</span>
            </span>
          </a>

          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="group flex min-h-14 min-w-0 items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 transition hover:-translate-y-0.5 hover:border-orange/40 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange/40"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-orange text-white">
              <IconMail className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-black">Email</span>
              <span className="block truncate text-xs text-muted-bluegray">{CONTACT_EMAIL}</span>
            </span>
          </a>

          <a
            href={CONTACT_PHONES[0].href}
            className="group flex min-h-14 items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 transition hover:-translate-y-0.5 hover:border-orange/40 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange/40"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-orange text-white">
              <IconPhone className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-sm font-black">Call Us</span>
              <span className="block text-xs text-muted-bluegray">{CONTACT_PHONES[0].label}</span>
            </span>
          </a>
        </div>
      </div>

      <div className="border-b border-white/10 px-4 py-12 sm:px-8 sm:py-14">
        <div className="mx-auto grid max-w-7xl gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          <div>
            <Link href="/" className="inline-flex items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange/40">
              <Image src="/logo.png" width={64} height={64} className="h-14 w-14 object-contain" alt="Travel With Hawkins logo" />
              <span className="leading-tight">
                <span className="block text-2xl font-black">Travel</span>
                <span className="block text-sm font-semibold text-muted-bluegray">with Hawkins</span>
              </span>
            </Link>
            <p className="mt-5 max-w-sm text-sm leading-6 text-muted-bluegray">
              Connecting university students with trusted bus operators for safe, reliable journeys across Malawi.
            </p>
            <p className="mt-3 text-xs font-black uppercase tracking-[0.18em] text-orange">Safe Journeys. Trusted Service.</p>
          </div>

          <nav aria-label="Footer quick links">
            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-white">Quick Links</h2>
            <ul className="mt-5 space-y-3 text-sm">
              {QUICK_LINKS.map(([label, href]) => (
                <li key={label}>
                  <Link href={href} className="inline-flex min-h-8 items-center text-muted-bluegray transition hover:translate-x-1 hover:text-orange focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Footer company links">
            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-white">Company</h2>
            <ul className="mt-5 space-y-3 text-sm">
              {COMPANY_LINKS.map(([label, href]) => (
                <li key={label}>
                  <Link href={href} className="inline-flex min-h-8 items-center text-muted-bluegray transition hover:translate-x-1 hover:text-orange focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-white">Newsletter</h2>
            <p className="mt-5 text-sm leading-6 text-muted-bluegray">Subscribe for travel tips and special offers.</p>
            <div className="mt-4 flex max-w-xs gap-2">
              <label htmlFor="footer-newsletter-email" className="sr-only">Email address</label>
              <input
                id="footer-newsletter-email"
                type="email"
                disabled
                placeholder="Your email address"
                className="min-h-11 w-full min-w-0 rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white placeholder:text-muted-bluegray disabled:cursor-not-allowed"
              />
              <button
                type="button"
                disabled
                title="Newsletter signups are coming soon"
                className="min-h-11 shrink-0 cursor-not-allowed rounded-lg border border-white/15 bg-white/5 px-4 text-sm font-bold text-white/50"
              >
                Subscribe
              </button>
            </div>
            <p className="mt-2 text-xs text-muted-bluegray">Coming soon — reach us on WhatsApp or email for updates in the meantime.</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-5 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 text-xs text-muted-bluegray sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} Travel with Hawkins. All rights reserved.</p>
          <div className="flex gap-5">
            <Link href="/terms" className="transition hover:text-orange focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange">Terms & Conditions</Link>
            <Link href="/privacy" className="transition hover:text-orange focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange">Privacy Policy</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
