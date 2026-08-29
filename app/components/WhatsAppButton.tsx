import { IconWhatsApp } from "./Icon";
import { buildWhatsAppLink } from "@/lib/whatsappLink";

// Points at the official Travel With Hawkins bot number via the canonical
// builder. Kept as a named export so existing importers (footer, contact page)
// stay in sync automatically.
export const whatsappUrl = buildWhatsAppLink("Hello Travel With Hawkins, I would like to book transport");

export default function WhatsAppButton() {
  return (
    <a
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with Travel With Hawkins on WhatsApp"
      className="fixed bottom-5 right-4 z-40 grid h-14 w-14 place-items-center rounded-full border-2 border-white bg-[#168c4b] shadow-lg shadow-slate-950/25 transition duration-200 hover:-translate-y-1 hover:bg-[#11723d] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange focus-visible:ring-offset-2 sm:bottom-6 sm:right-6 sm:h-12 sm:w-12"
    >
      <IconWhatsApp className="h-8 w-8 text-white sm:h-6 sm:w-6" />
    </a>
  );
}
