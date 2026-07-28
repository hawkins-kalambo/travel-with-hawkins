import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
  description: "Learn about Travel with Hawkins and its student transport services across Malawi.",
  alternates: {
    canonical: "/about",
  },
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-16">
      <div className="mx-auto max-w-4xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-black text-slate-900">About Travel with Hawkins</h1>
        <p className="mt-4 text-lg text-slate-600">This page remains available as part of the public website experience.</p>
      </div>
    </main>
  );
}
