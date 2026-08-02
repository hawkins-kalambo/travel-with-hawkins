import { IconMail, IconPhone, IconWhatsApp } from "../Icon";
import { whatsappUrl } from "../WhatsAppButton";

const CONTACT_EMAIL = "contact@travelwithhawkins.com";
const CONTACT_PHONES = [
  { href: "tel:+265886470843", label: "0886 470 843" },
  { href: "tel:+265989127308", label: "0989 127 308" },
];

export default function ContactCardsSection() {
  return (
    <section className="px-4 pb-8 pt-8 sm:pt-0">
      <div className="mx-auto grid max-w-6xl gap-4 rounded-3xl bg-[#071f3d] p-6 text-white sm:p-8 md:grid-cols-3">
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
            <span className="block text-xs text-slate-300">Chat with us anytime</span>
          </span>
        </a>

        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="group flex min-h-14 min-w-0 items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 transition hover:-translate-y-0.5 hover:border-sky-300/40 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-300/40"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-sky-600 text-white">
            <IconMail className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-black">Email</span>
            <span className="block truncate text-xs text-slate-300">{CONTACT_EMAIL}</span>
          </span>
        </a>

        <a
          href={CONTACT_PHONES[0].href}
          className="group flex min-h-14 items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 transition hover:-translate-y-0.5 hover:border-sky-300/40 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-300/40"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[#155ea6] text-white">
            <IconPhone className="h-5 w-5" />
          </span>
          <span>
            <span className="block text-sm font-black">Call Us</span>
            <span className="block text-xs text-slate-300">{CONTACT_PHONES[0].label}</span>
          </span>
        </a>
      </div>
    </section>
  );
}
