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
      <svg
        aria-hidden="true"
        viewBox="0 0 32 32"
        className="h-8 w-8 fill-white sm:h-9 sm:w-9"
      >
        <path d="M16.04 3A12.9 12.9 0 0 0 5.02 22.62L3 29l6.56-1.93A12.98 12.98 0 1 0 16.04 3Zm0 23.76c-2.1 0-4.13-.61-5.87-1.76l-.42-.25-3.89 1.14 1.16-3.79-.28-.44a10.76 10.76 0 1 1 9.3 5.1Zm5.9-8.05c-.32-.16-1.91-.94-2.21-1.05-.29-.11-.5-.16-.72.16-.21.32-.82 1.05-1.01 1.27-.18.21-.37.24-.69.08-.32-.16-1.36-.5-2.58-1.6a9.68 9.68 0 0 1-1.79-2.22c-.19-.32-.02-.49.14-.65.15-.14.32-.37.48-.56.16-.18.21-.32.32-.53.11-.21.05-.4-.03-.56-.08-.16-.72-1.73-.98-2.37-.26-.62-.52-.54-.72-.55h-.61c-.21 0-.56.08-.85.4-.29.32-1.11 1.08-1.11 2.64 0 1.56 1.14 3.07 1.3 3.28.16.21 2.24 3.42 5.42 4.8.76.32 1.35.52 1.81.67.76.24 1.45.21 2 .13.61-.09 1.91-.78 2.18-1.53.27-.75.27-1.4.19-1.53-.08-.13-.29-.21-.61-.37Z" />
      </svg>
    </a>
  );
}
