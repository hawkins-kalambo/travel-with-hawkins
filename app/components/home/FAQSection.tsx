import { IconChevronDown } from "../Icon";

const FAQ_ITEMS = [
  {
    q: "How do I book a bus ticket?",
    a: "Choose your route or enter a custom destination, fill in your details, select your travel date and seat count, and submit the booking form.",
  },
  {
    q: "Can I cancel or reschedule my booking?",
    a: "Changes are handled based on availability and timing. Contact us with your booking ID as soon as possible so we can assist you.",
  },
  {
    q: "How will I receive my confirmation?",
    a: "Once your booking is submitted, the system records it and the admin confirms the payment and trip details for you.",
  },
  {
    q: "What payment methods do you accept?",
    a: "Payments are confirmed through the booking process and verified by the admin team before your trip is fully confirmed.",
  },
  {
    q: "Is my payment secure?",
    a: "Yes. Bookings and payment updates are managed through the secure admin-backed system, and receipts are generated for confirmed trips.",
  },
  {
    q: "Who can I contact for support?",
    a: "You can reach us through the WhatsApp button or email listed in the contact section for booking, payment, or travel support.",
  },
];

export default function FAQSection() {
  return (
    <section id="help-center" className="scroll-mt-24 border-t border-slate-100 px-4 pb-12 pt-10 sm:border-t-0 sm:pt-0">
      <div className="mx-auto max-w-6xl">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0f3f78]">Frequently Asked Questions</p>
        <h2 className="text-2xl font-black text-[#101815] sm:text-3xl">Got Questions? We&apos;ve Got Answers</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {FAQ_ITEMS.map((item) => (
            <details key={item.q} className="group rounded-xl border border-slate-200 bg-white px-5 py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-bold text-slate-900">
                {item.q}
                <IconChevronDown className="h-4 w-4 shrink-0 text-[#0f3f78] transition group-open:rotate-180" />
              </summary>
              <p className="mt-2 text-sm text-slate-600">{item.a}</p>
            </details>
          ))}
        </div>
        <p className="mt-6 text-sm font-semibold text-slate-600">
          Still need help? <a href="#contact" className="font-black text-[#0f3f78] hover:underline">Contact us</a>
        </p>
      </div>
    </section>
  );
}
