import Image from "next/image";

const TEAM = [
  {
    role: "C.E.O",
    name: "Mwira Mcdonald Mukumbwa",
    img: "/images/team/Mwira.jpeg",
    bio: "Leads the company's vision and partnerships, from onboarding trusted bus operators to steering where Travel with Hawkins goes next.",
  },
  {
    role: "Lead Systems Analyst",
    name: "Hawkins Kalambo",
    img: "/images/team/hawkins.jpeg",
    bio: "Builds and maintains the booking platform, keeping the website fast, secure, and easy to use for every traveller.",
  },
  {
    role: "Financial Analyst",
    name: "Joshua Kalambo",
    img: "/images/team/joshua.jpg",
    bio: "Oversees payments, pricing, and financial reporting so bookings stay accurate and transparent.",
  },
];

export default function TeamSection() {
  return (
    <section id="bus-partners" className="border-t border-slate-100 px-4 py-12 sm:border-t-0 sm:py-10">
      <div className="mx-auto max-w-5xl text-center">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0f3f78]">Meet The Team</p>
        <h2 className="mt-1 text-2xl font-black text-[#101815] sm:text-3xl">The People Behind Travel With Hawkins</h2>
        <div className="mt-8 grid gap-5 sm:grid-cols-3 sm:gap-6">
          {TEAM.map(({ role, name, img, bio }) => (
            <div key={role} className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
              <Image
                src={img}
                width={128}
                height={128}
                className="h-28 w-28 rounded-full border-4 border-white object-cover object-[center_15%] shadow-md sm:h-32 sm:w-32"
                alt={name}
              />
              <div className="mt-4 text-base font-black text-[#0f3f78] sm:text-lg">{name}</div>
              <div className="text-sm font-semibold text-slate-700">{role}</div>
              <p className="mt-2 text-xs leading-relaxed text-slate-600 sm:text-sm">{bio}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
