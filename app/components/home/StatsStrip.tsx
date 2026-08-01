import { IconRoute, IconBus, IconStar, IconUsers } from "../Icon";

const STATS = [
  { value: "5,000+", label: "Students Travelled", Icon: IconUsers },
  { value: "25+", label: "Trusted Bus Companies", Icon: IconBus },
  { value: "120+", label: "Routes Across Malawi", Icon: IconRoute },
  { value: "4.9/5", label: "Average Student Rating", Icon: IconStar },
];

export default function StatsStrip() {
  return (
    <section className="bg-[#f4f8fd] px-4 py-8">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-6 md:grid-cols-4">
        {STATS.map(({ value, label, Icon }) => (
          <div key={label} className="flex items-center gap-3 border-slate-200 md:border-r md:last:border-r-0">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#0f3f78] text-white">
              <Icon className="h-5 w-5" title={label} />
            </span>
            <div>
              <div className="text-2xl font-black text-[#0a2d56]">{value}</div>
              <div className="text-xs font-medium text-slate-600">{label}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
