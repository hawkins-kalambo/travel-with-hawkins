import type { Metadata } from "next";
import WhatsAppButton from "../components/WhatsAppButton";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Learn how Travel with Hawkins handles booking information, contact details, and privacy preferences.",
  alternates: {
    canonical: "/privacy",
  },
};

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: "Introduction",
    body: (
      <p>
        This Privacy Policy explains what information Travel with Hawkins collects when you use our website and
        booking services, how we use it, and the choices you have. By using the Service, you agree to the collection
        and use of information as described here.
      </p>
    ),
  },
  {
    title: "Information We Collect",
    body: (
      <>
        <p>When you book a trip or create an account, we may collect:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Your full name, phone number, and email address.</li>
          <li>
            Student information where applicable, such as student ID, university, faculty, programme, and year of
            study.
          </li>
          <li>Account credentials (your email and a securely hashed password, or your Google account details if you sign in with Google).</li>
          <li>Booking history, including routes, travel dates, seat counts, booking status, and referral codes used.</li>
          <li>
            Payment reference information, such as transaction status and amount. We do not collect or store your
            card number, mobile money PIN, or bank details — these are handled directly and securely by our payment
            partner, PayChangu.
          </li>
          <li>Messages you send us through the contact form, WhatsApp, or email.</li>
        </ul>
      </>
    ),
  },
  {
    title: "How We Use Your Information",
    body: (
      <>
        <p>We use the information we collect to:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Process and confirm your bookings, and coordinate with partner bus operators on your behalf.</li>
          <li>Verify payments made through PayChangu and keep an accurate record of your booking status.</li>
          <li>Communicate with you about your bookings, trip updates, delays, or account activity.</li>
          <li>Let you save your details so future bookings are faster to complete.</li>
          <li>Respond to support requests sent via the contact form, WhatsApp, or email.</li>
          <li>Improve the reliability and safety of our services, and detect misuse of the booking or referral system.</li>
        </ul>
      </>
    ),
  },
  {
    title: "Data Storage and Security",
    body: (
      <p>
        Your account and booking data is stored using Supabase, our database and authentication provider, which
        applies industry-standard security practices including encrypted connections and access controls. Only
        authorized administrators can access booking records needed to confirm and manage trips. While we take
        reasonable steps to protect your information, no online system can be guaranteed to be completely secure.
      </p>
    ),
  },
  {
    title: "Sharing Your Information",
    body: (
      <>
        <p>We do not sell your personal information. We share limited information only where necessary to operate the Service:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>With partner bus operators, so far as needed to arrange and confirm your seat on a trip.</li>
          <li>With PayChangu, our payment processor, to initiate and verify payments you make.</li>
          <li>With service providers that help us operate the platform, such as our hosting and email/SMS providers.</li>
          <li>Where required by law, regulation, or a valid legal request from a Malawian authority.</li>
        </ul>
      </>
    ),
  },
  {
    title: "Cookies and Local Storage",
    body: (
      <p>
        We use your browser&apos;s local storage to remember basic booking details (such as your name, student ID,
        and phone number) so you don&apos;t have to retype them on your next visit. This information stays on your
        device and is used only to pre-fill forms. We do not use third-party advertising cookies or trackers.
      </p>
    ),
  },
  {
    title: "Data Retention",
    body: (
      <p>
        We retain your account and booking history for as long as your account remains active, and for a reasonable
        period afterward to meet accounting, legal, and dispute-resolution needs. You may request that we delete your
        account and associated personal data at any time, subject to any records we are required to keep by law.
      </p>
    ),
  },
  {
    title: "Your Rights and Choices",
    body: (
      <>
        <p>You have the right to:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Access the personal information we hold about you.</li>
          <li>Ask us to correct inaccurate or outdated information in your profile.</li>
          <li>Request deletion of your account and personal data.</li>
          <li>Ask questions about how your information is used.</li>
        </ul>
        <p>
          To exercise any of these rights, contact us using the details in Section 10 below and we will respond as
          soon as reasonably possible.
        </p>
      </>
    ),
  },
  {
    title: "Children's Privacy",
    body: (
      <p>
        Our services are intended for university students and members of the public who are legally able to enter
        into a booking arrangement. We do not knowingly collect personal information from young children. If you
        believe a child has provided us with personal information, please contact us so we can remove it.
      </p>
    ),
  },
  {
    title: "Contacting Us",
    body: (
      <p>
        If you have questions about this Privacy Policy or how your data is handled, reach us through the WhatsApp
        button on this site, by email at{" "}
        <a href="mailto:contact@travelwithhawkins.com" className="font-semibold text-emerald-700 hover:underline">
          contact@travelwithhawkins.com
        </a>
        , or by phone.
      </p>
    ),
  },
  {
    title: "Changes to This Policy",
    body: (
      <p>
        We may update this Privacy Policy from time to time to reflect changes in our services or legal obligations.
        The &quot;Last updated&quot; date at the top of this page shows when the policy was last revised. We
        encourage you to review this page periodically.
      </p>
    ),
  },
  {
    title: "Governing Law",
    body: (
      <p>
        This Privacy Policy is governed by and construed in accordance with the laws of the Republic of Malawi.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-emerald-50 px-4 py-12 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">
          Last updated: August 1, 2026
        </span>
        <h1 className="mt-4 text-3xl font-black text-slate-900 sm:text-4xl">Privacy Policy</h1>
        <p className="mt-4 text-base leading-relaxed text-slate-600">
          Travel with Hawkins uses booking and contact information to manage transport requests and communicate
          updates to customers. This page explains what we collect, why, and how you stay in control of it.
        </p>

        <div className="mt-10 space-y-7 border-t border-slate-100 pt-8">
          {SECTIONS.map((section, index) => (
            <section key={section.title} className="flex gap-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-500 text-sm font-black text-white sm:h-10 sm:w-10">
                {index + 1}
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-black text-slate-900 sm:text-xl">{section.title}</h2>
                <div className="mt-3 max-w-[68ch] space-y-3 text-sm leading-relaxed text-slate-600 sm:text-base">
                  {section.body}
                </div>
              </div>
            </section>
          ))}
        </div>
      </div>
      <WhatsAppButton />
    </main>
  );
}
