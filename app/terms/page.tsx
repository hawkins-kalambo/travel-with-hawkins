import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Review the transport booking terms and conditions for Travel with Hawkins.",
  alternates: {
    canonical: "/terms",
  },
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-16">
      <div className="mx-auto max-w-4xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-black text-slate-900">Terms of Service</h1>
        <p className="mt-4 text-lg text-slate-600">
          Bookings are subject to availability, payment confirmation, and the transport policies published by Travel with Hawkins.
        </p>
      </div>
    </main>
  );
}
