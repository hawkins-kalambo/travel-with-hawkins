import Link from "next/link";
import Image from "next/image";

const sections = [
  { slug: "routes-and-fares", title: "Routes & Fares", description: "Manage every route, fare, capacity and status from a single business object." },
  { slug: "commission-rates", title: "Commission Rates", description: "Control fixed and percentage commissions by route and preserve historical commission amounts." },
  { slug: "referral-program", title: "Referral Program", description: "Configure your referral workflow, code policies, eligibility and defaults." },
  { slug: "trip-rules", title: "Trip Rules", description: "Tune operational rules like capacity, deadlines and commission automation." },
  { slug: "payment-settings", title: "Payment Settings", description: "Manage currency, accepted payment methods and receipt generation." },
  { slug: "notifications", title: "Notifications", description: "Enable or disable email, SMS and ambassador notification workflows." },
  { slug: "system-preferences", title: "System Preferences", description: "Update company branding, support contacts and policies." },
];

export default function BusinessConfigurationPage() {
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#0f3f78]">Business Configuration</p>
              <h1 className="text-3xl font-black text-slate-900">Central business controls for Travel with Hawkins</h1>
              <p className="mt-2 text-sm text-slate-500">Configure routes, commissions, referrals, payments, notifications and system preferences without touching source code.</p>
            </div>
            <Link
              href="/admin"
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Back to admin dashboard
            </Link>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sections.map((section) => (
            <Link
              key={section.slug}
              href={`/admin/business-configuration/${section.slug}`}
              className="group rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-primary-300 hover:shadow-lg"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-100 text-primary-900 text-lg font-bold">{section.slug.charAt(0).toUpperCase()}</div>
              <h2 className="text-xl font-semibold text-slate-900 mb-2">{section.title}</h2>
              <p className="text-sm leading-6 text-slate-600">{section.description}</p>
              <div className="mt-4 text-sm font-semibold text-primary-700">Manage {section.title} →</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
