import Image from "next/image";
import Link from "next/link";

const QUICK_LINKS: Array<[string, string]> = [
  ["Home", "/"],
  ["Trips", "/trips"],
  ["Routes", "/#routes"],
  ["Customize", "/#customize"],
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
  return (
    <footer id="contact" className="scroll-mt-24 overflow-hidden bg-[#071f3d] text-white">
      <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(31,120,209,0.2),transparent_36%)] px-4 py-12 sm:px-8 sm:py-14">
        <div className="mx-auto grid max-w-7xl gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          <div>
            <Link href="/" className="inline-flex items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-300/50">
              <Image src="/logo.png" width={64} height={64} className="h-14 w-14 object-contain" alt="Travel With Hawkins logo" />
              <span className="leading-tight">
                <span className="block text-2xl font-black">Travel</span>
                <span className="block text-sm font-semibold text-blue-200">with Hawkins</span>
              </span>
            </Link>
            <p className="mt-5 max-w-sm text-sm leading-6 text-slate-300">
              Connecting university students with trusted bus operators for safe, reliable journeys across Malawi.
            </p>
          </div>

          <nav aria-label="Footer quick links">
            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-sky-300">Quick Links</h2>
            <ul className="mt-5 space-y-3 text-sm">
              {QUICK_LINKS.map(([label, href]) => (
                <li key={label}>
                  <Link href={href} className="inline-flex min-h-8 items-center text-slate-300 transition hover:translate-x-1 hover:text-white focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Footer company links">
            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-sky-300">Company</h2>
            <ul className="mt-5 space-y-3 text-sm">
              {COMPANY_LINKS.map(([label, href]) => (
                <li key={label}>
                  <Link href={href} className="inline-flex min-h-8 items-center text-slate-300 transition hover:translate-x-1 hover:text-white focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-sky-300">Newsletter</h2>
            <p className="mt-5 text-sm leading-6 text-slate-300">Subscribe for travel tips and special offers.</p>
            <div className="mt-4 flex max-w-xs gap-2">
              <label htmlFor="footer-newsletter-email" className="sr-only">Email address</label>
              <input
                id="footer-newsletter-email"
                type="email"
                disabled
                placeholder="Your email address"
                className="min-h-11 w-full min-w-0 rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white placeholder:text-slate-400 disabled:cursor-not-allowed"
              />
              <button
                type="button"
                disabled
                title="Newsletter signups are coming soon"
                className="min-h-11 shrink-0 cursor-not-allowed rounded-lg bg-[#155ea6]/50 px-4 text-sm font-bold text-white"
              >
                Subscribe
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-400">Coming soon — reach us on WhatsApp or email for updates in the meantime.</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-5 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 Travel with Hawkins. All rights reserved.</p>
          <div className="flex gap-5">
            <Link href="/terms" className="transition hover:text-white focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300">Terms & Conditions</Link>
            <Link href="/privacy" className="transition hover:text-white focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300">Privacy Policy</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
