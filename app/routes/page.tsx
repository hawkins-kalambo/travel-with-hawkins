import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Routes & Destinations",
  description: "Browse student transport routes across Malawi, including Mzuzu to Lilongwe, Blantyre, Zomba, Kasungu, and Karonga.",
  alternates: {
    canonical: "/routes",
  },
};

const routes = [
  { name: "Mzuzu to Lilongwe", detail: "Reliable daily student transport between the two major cities." },
  { name: "Mzuzu to Blantyre", detail: "Comfortable intercity travel for students and families." },
  { name: "Mzuzu to Zomba", detail: "Flexible scheduling for academic and personal travel." },
  { name: "Mzuzu to Kasungu", detail: "Affordable transport for short and mid-distance travel." },
  { name: "Mzuzu to Karonga", detail: "Trusted long-distance trips across northern Malawi." },
];

export default function RoutesPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-16">
      <div className="mx-auto max-w-5xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#0f3f78]">Routes</p>
        <h1 className="mt-3 text-3xl font-black text-slate-900">Student transport routes across Malawi</h1>
        <p className="mt-4 max-w-3xl text-lg text-slate-600">
          Travel with Hawkins supports dependable student travel between key education and city hubs, with bookings that are easy to arrange and track.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {routes.map((route) => (
            <article key={route.name} className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
              <h2 className="text-xl font-bold text-slate-900">{route.name}</h2>
              <p className="mt-2 text-sm text-slate-600">{route.detail}</p>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
