import { IconDollar, IconHeadset, IconShield, IconUser } from "../Icon";

const WHY_CHOOSE_US = [
  { title: "Trusted Operators", body: "We partner with verified and reliable bus companies across Malawi.", Icon: IconShield },
  { title: "Student Focused", body: "Built for university students, with affordable and convenient travel.", Icon: IconUser },
  { title: "Best Prices", body: "Compare and book at the best prices available.", Icon: IconDollar },
  { title: "24/7 Support", body: "We're here to help you before, during and after your trip.", Icon: IconHeadset },
];

const HOW_IT_WORKS = [
  { n: "1", title: "Search", body: "Enter your route, date and passengers to find available trips." },
  { n: "2", title: "Choose", body: "Compare operators, prices and schedules." },
  { n: "3", title: "Book", body: "Confirm your seat and make payment securely." },
  { n: "4", title: "Travel", body: "Get your ticket and enjoy a safe journey home." },
];

export default function WhyChooseUsSection() {
  return (
    <section id="how-it-works" className="scroll-mt-24 border-t border-slate-100 bg-white px-4 py-12 sm:border-t-0 sm:py-10">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-xl font-black text-[#101815] sm:text-2xl">Why Choose Us</h2>
          <div className="mt-5 space-y-5">
            {WHY_CHOOSE_US.map(({ title, body, Icon }) => (
              <div key={title} className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-blue-50 text-[#0f3f78]">
                  <Icon className="h-5 w-5" title={title} />
                </span>
                <div>
                  <h3 className="text-sm font-black text-slate-900">{title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-[#071f3d] p-6 text-white shadow-sm sm:p-8">
          <h2 className="text-xl font-black sm:text-2xl">How It Works</h2>
          <ol className="mt-5">
            {HOW_IT_WORKS.map((step, index) => (
              <li key={step.n} className="relative flex gap-4 pb-7 last:pb-0">
                {index < HOW_IT_WORKS.length - 1 && (
                  <span className="absolute left-[19px] top-10 h-[calc(100%-2.5rem)] w-px border-l-2 border-dashed border-sky-300/40" aria-hidden="true" />
                )}
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sky-500 text-sm font-black text-white">{step.n}</span>
                <div>
                  <h3 className="text-sm font-black">{step.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-300">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
