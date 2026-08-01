import { IconWhatsApp } from "./Icon";

export const whatsappUrl =
  "https://wa.me/265989127308?text=Hello%20Travel%20With%20Hawkins%2C%20I%20would%20like%20to%20book%20transport";

export default function WhatsAppButton() {
  return (
    <a
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with Travel With Hawkins on WhatsApp"
      className="fixed bottom-5 right-4 z-40 grid h-14 w-14 place-items-center rounded-full border-2 border-white bg-[#168c4b] shadow-lg shadow-slate-950/25 transition duration-200 hover:-translate-y-1 hover:bg-[#11723d] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#0f3f78] focus-visible:ring-offset-2 sm:bottom-6 sm:right-6 sm:h-16 sm:w-16"
    >
      <IconWhatsApp className="h-8 w-8 text-white sm:h-9 sm:w-9" />
    </a>
  );
}
