import type { Metadata } from "next";
import WhatsAppButton from "../components/WhatsAppButton";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Learn how Travel with Hawkins handles booking information, contact details, and privacy preferences.",
  alternates: {
    canonical: "/privacy",
  },
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-16">
      <div className="mx-auto max-w-4xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-black text-slate-900">Privacy Policy</h1>
        <p className="mt-4 text-lg text-slate-600">
          Travel with Hawkins uses booking and contact information to manage transport requests and communicate updates to customers.
        </p>
      </div>
      <WhatsAppButton />
    </main>
  );
}
