import Link from "next/link";
import { IconBell, IconCalendar, IconClock } from "../Icon";

const ACCOUNT_BENEFITS = [
  {
    title: "Manage Bookings",
    body: "View, modify and cancel your bookings anytime.",
    Icon: IconCalendar,
  },
  {
    title: "Faster Repeat Travel",
    body: "Save your details for quicker bookings next time.",
    Icon: IconClock,
  },
  {
    title: "Stay Informed",
    body: "Get updates on trips, delays and special offers.",
    Icon: IconBell,
  },
];

export default function AccountBenefitsSection() {
  return (
    <section id="why-account" className="bg-[#f8fbff] px-4 py-12 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 text-center">
          <h2 className="mt-1 text-2xl font-black text-[#101815] sm:text-3xl">Your Account. Your Journey.</h2>
          <p className="mt-2 text-sm font-medium text-slate-600">Create an account to enjoy a smoother travel experience.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {ACCOUNT_BENEFITS.map(({ title, body, Icon }) => (
            <div key={title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-[#0f3f78]">
                <Icon className="h-5 w-5" title={`${title} benefit`} />
              </div>
              <h3 className="text-base font-black text-[#0f3f78]">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{body}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 flex justify-center">
          <Link
            href="/customer/login"
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#0f3f78] px-6 text-sm font-black text-white shadow-sm transition hover:bg-[#0a2d56] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200"
          >
            Create Account / Sign In
          </Link>
        </div>
      </div>
    </section>
  );
}
