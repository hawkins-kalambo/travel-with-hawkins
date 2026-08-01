import Image from "next/image";

const TEAM = [
  { role: "C.E.O", name: "Mwira Mcdonald Mukumbwa", img: "/images/team/Mwira.jpeg" },
  { role: "Lead Systems Analyst", name: "Hawkins Kalambo", img: "/images/team/hawkins.jpeg" },
  { role: "Financial Analyst", name: "Joshua Kalambo", img: "/images/team/joshua.jpg" },
];

export default function TeamSection() {
  return (
    <section id="bus-partners" className="px-4 py-10">
      <div className="mx-auto max-w-4xl text-center">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0f3f78]">Meet The Team</p>
        <h2 className="mt-1 text-2xl font-black text-[#101815] sm:text-3xl">The People Behind Travel With Hawkins</h2>
        <div className="mt-8 flex flex-wrap justify-center gap-8 sm:gap-12">
          {TEAM.map(({ role, name, img }) => (
            <div key={role} className="flex flex-col items-center">
              <Image
                src={img}
                width={112}
                height={112}
                className="h-24 w-24 rounded-full border-4 border-white object-cover object-[center_15%] shadow-md sm:h-28 sm:w-28"
                alt={name}
              />
              <div className="mt-3 text-sm font-black text-[#0f3f78]">{name}</div>
              <div className="text-xs font-medium text-slate-600">{role}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
