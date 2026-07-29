import type { Metadata } from "next";
import ContactForm from "./ContactForm";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with Travel with Hawkins for student transport bookings and support.",
  alternates: {
    canonical: "/contact",
  },
};

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-16">
      <div className="mx-auto max-w-4xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-black text-slate-900">Contact Travel with Hawkins</h1>
        <p className="mt-4 text-lg text-slate-600">
          Send us a message for booking, payment, or travel support.
        </p>
        <ContactForm />
      </div>
    </main>
  );
}
