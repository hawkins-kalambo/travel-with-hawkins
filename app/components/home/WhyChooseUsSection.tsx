import { IconCalendar, IconCreditCard, IconSearch, IconShield, IconTicket, IconUser } from "../Icon";

const WHY_STUDENTS_CHOOSE_US = [
  {
    title: "Safe & Verified",
    body: "Vetted drivers, modern buses, and safety-first standards for your peace of mind.",
    Icon: IconShield,
  },
  {
    title: "Easy Online Booking",
    body: "Book your seat in minutes and get instant confirmation.",
    Icon: IconCalendar,
  },
  {
    title: "Student-Friendly Travel",
    body: "Affordable fares, flexible options, and service designed with students in mind.",
    Icon: IconUser,
  },
];

const HOW_IT_WORKS = [
  { n: "1", title: "Search", body: "Find your route and preferred travel date.", Icon: IconSearch },
  { n: "2", title: "Book", body: "Choose your seats and confirm online.", Icon: IconTicket },
  { n: "3", title: "Pay", body: "Pay securely using mobile money or card.", Icon: IconCreditCard },
  { n: "4", title: "Travel", body: "Board your bus and enjoy a safe, comfortable journey.", Icon: IconShield },
];

export default function WhyChooseUsSection() {
  return (
    <>
      <section className="border-t border-border-light bg-brand-off-white px-4 py-12 sm:border-t-0 sm:py-16">
        <div className="mx-auto max-w-6xl text-center">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-orange">Why Students Trust Us</p>
          <h2 className="mt-1 text-2xl font-black text-navy sm:text-3xl">Why Students Choose Us</h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-3">
            {WHY_STUDENTS_CHOOSE_US.map(({ title, body, Icon }) => (
              <div key={title} className="flex h-full flex-col items-center rounded-2xl border border-border-light bg-white p-6 text-center shadow-sm sm:p-7">
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-orange-soft text-orange">
                  <Icon className="h-6 w-6" title={title} />
                </span>
                <h3 className="mt-4 text-base font-black text-navy">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-24 border-t border-border-light bg-white px-4 py-12 sm:border-t-0 sm:py-16">
        <div className="mx-auto max-w-6xl text-center">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-orange">Simple Process</p>
          <h2 className="mt-1 text-2xl font-black text-navy sm:text-3xl">How It Works</h2>
          <ol className="mt-10 grid gap-8 sm:grid-cols-4 sm:gap-4">
            {HOW_IT_WORKS.map((step, index) => (
              <li key={step.n} className={`relative flex flex-col items-center ${index < HOW_IT_WORKS.length - 1 ? "stepper-connector active" : ""}`}>
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-orange text-white shadow-sm">
                  <step.Icon className="h-6 w-6" title={step.title} />
                </span>
                <h3 className="mt-4 text-sm font-black text-navy">{step.title}</h3>
                <p className="mt-1 max-w-[200px] text-xs leading-relaxed text-slate-600">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}
