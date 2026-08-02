import type { Metadata } from "next";
import WhatsAppButton from "../components/WhatsAppButton";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Review the transport booking terms and conditions for Travel with Hawkins.",
  alternates: {
    canonical: "/terms",
  },
};

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: "1. Acceptance of These Terms",
    body: (
      <p>
        By creating an account, making a booking, or otherwise using the Travel with Hawkins website or services (the
        &quot;Service&quot;), you agree to be bound by these Terms &amp; Conditions. If you do not agree with any part of these
        terms, please do not use the Service. We may update these terms from time to time, and continued use of the
        Service after changes are posted means you accept the updated terms.
      </p>
    ),
  },
  {
    title: "2. Account Creation and Eligibility",
    body: (
      <>
        <p>
          You can book a trip as a guest or by creating a customer account. Creating an account lets you save your
          details, view your booking history, and manage upcoming trips from your dashboard. Accounts can be created
          with an email address and password, or by signing in with Google.
        </p>
        <p>
          When registering, you must provide accurate and current information, including your full name, phone number,
          and, where applicable, your student details (student ID, university, faculty, programme, and year of study).
          You are responsible for keeping your login credentials confidential and for all activity that happens under
          your account. Accounts may be used by university students and members of the public travelling on our
          routes.
        </p>
      </>
    ),
  },
  {
    title: "3. Bookings and Trip Requests",
    body: (
      <>
        <p>
          You may book a published route or request a customized trip by choosing your own departure district and
          destination university. A booking is submitted as a request and is not guaranteed until it has been
          reviewed and confirmed through our admin-backed booking system. We will do our best to confirm bookings
          promptly, but availability, seat capacity, and operator scheduling may affect confirmation.
        </p>
        <p>
          You are responsible for making sure the details you submit — including travel date, number of seats, and
          contact information — are correct. Incorrect details may delay or prevent confirmation of your trip.
        </p>
      </>
    ),
  },
  {
    title: "4. Payments and Booking Fees",
    body: (
      <>
        <p>
          Certain bookings require a booking fee or fare payment to secure your seat. Payments are processed securely
          through our payment partner, PayChangu, and are verified by our admin team before a booking is treated as
          fully confirmed. We do not store your card, mobile money, or bank details on our servers — payment
          processing is handled directly by PayChangu.
        </p>
        <p>
          Prices shown on the Service are indicative and may be updated based on route, operator, and demand. Any
          applicable booking fee is separate from the full trip fare unless stated otherwise at the time of booking.
        </p>
      </>
    ),
  },
  {
    title: "5. Cancellations, Rescheduling and Refunds",
    body: (
      <p>
        If you need to cancel or reschedule a trip, contact us as soon as possible using your booking ID, ideally
        through WhatsApp or email. Changes are handled on a case-by-case basis depending on how close the request is
        to the travel date, seat availability, and the policies of the partner bus operator for that route. Refunds,
        where applicable, are processed at our discretion and may take time to reflect depending on the original
        payment method. Failure to show up for a confirmed trip without prior notice may affect eligibility for a
        refund.
      </p>
    ),
  },
  {
    title: "6. Bus Operator Partnerships and Third-Party Services",
    body: (
      <p>
        Travel with Hawkins works with independent, partner bus operators to provide transport across Malawi. While
        we vet and coordinate with these operators, the actual transport service is delivered by the third-party bus
        company. We are not the operator of the vehicles used for your trip, and factors such as departure times,
        vehicle condition, and on-the-road conduct are managed by the partner operator, though we work closely with
        them to maintain a safe and reliable standard of service.
      </p>
    ),
  },
  {
    title: "7. Referral Program",
    body: (
      <p>
        Customers may use a valid referral or ambassador code when booking. Referral codes are subject to validation
        and may be changed, limited, or discontinued at any time. Misuse of referral codes, including fraudulent or
        repeated abuse of the program, may result in the booking or code being invalidated.
      </p>
    ),
  },
  {
    title: "8. User Conduct",
    body: (
      <p>
        You agree to use the Service honestly and not to submit false booking information, attempt to interfere with
        the operation of the website, or misuse the booking, payment, or referral systems. We reserve the right to
        suspend or restrict access to the Service for accounts found to be in violation of these terms.
      </p>
    ),
  },
  {
    title: "9. Limitation of Liability",
    body: (
      <p>
        Travel with Hawkins acts as a booking and coordination platform connecting students and travellers with
        trusted bus operators. To the fullest extent permitted by law, we are not liable for delays, cancellations,
        loss, injury, or damages arising from the acts or omissions of third-party bus operators, events outside our
        reasonable control (such as road conditions, weather, or mechanical issues), or misuse of the Service by a
        user. Where liability cannot be excluded by law, our liability is limited to the amount of the booking fee
        paid for the affected trip.
      </p>
    ),
  },
  {
    title: "10. Contacting Us",
    body: (
      <p>
        For booking support, payment queries, cancellations, or general questions, you can reach us through the
        WhatsApp button on this site, by email at{" "}
        <a href="mailto:contact@travelwithhawkins.com" className="font-semibold text-[#0f3f78] hover:underline">
          contact@travelwithhawkins.com
        </a>
        , or by phone. We aim to respond as quickly as possible during business hours.
      </p>
    ),
  },
  {
    title: "11. Changes to These Terms",
    body: (
      <p>
        We may revise these Terms &amp; Conditions from time to time to reflect changes in our services, payment
        processes, or legal requirements. The &quot;Last updated&quot; date at the top of this page shows when the
        terms were last revised. We encourage you to review this page periodically.
      </p>
    ),
  },
  {
    title: "12. Governing Law",
    body: (
      <p>
        These Terms &amp; Conditions are governed by and construed in accordance with the laws of the Republic of
        Malawi. Any disputes arising from your use of the Service will be subject to the exclusive jurisdiction of
        the courts of Malawi.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-off-white px-4 py-12 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-[#0f3f78]">
          Last updated: August 1, 2026
        </span>
        <h1 className="mt-4 text-3xl font-black text-slate-900 sm:text-4xl">Terms of Service</h1>
        <p className="mt-4 text-base leading-relaxed text-slate-600">
          These Terms &amp; Conditions explain how bookings, payments, and account use work on Travel with Hawkins.
          Please read them carefully before using our services.
        </p>

        <div className="mt-10 space-y-7 border-t border-slate-100 pt-8">
          {SECTIONS.map((section) => (
            <section key={section.title} className="border-l-4 border-[#dceaf8] pl-4 sm:pl-6">
              <h2 className="text-lg font-black text-slate-900 sm:text-xl">{section.title}</h2>
              <div className="mt-3 max-w-[68ch] space-y-3 text-sm leading-relaxed text-slate-600 sm:text-base">
                {section.body}
              </div>
            </section>
          ))}
        </div>
      </div>
      <WhatsAppButton />
    </main>
  );
}
