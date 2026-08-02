import Image from "next/image";
import { IconRoute } from "../Icon";
import { formatMwk } from "@/lib/routePricing";

export const ROUTES_DATA = [
  { route: "Lilongwe - Mzuzu", buses: "Travel With Us today", fallbackPrice: 70000, rating: "4.8 (120+)", img: "/images/routes/mzuzu-lilongwe.jpg" },
  { route: "Blantyre - Mzuzu", buses: "Travel With Us today", fallbackPrice: 120000, rating: "4.7 (98+)", img: "/images/routes/mzuzu-blantyre.jpg" },
  { route: "Zomba - Mzuzu", buses: "Travel With Us today", fallbackPrice: 110000, rating: "4.6 (76+)", img: "/images/routes/mzuzu-zomba.jpeg" },
  { route: "Kasungu - Mzuzu", buses: "Travel With Us Today", fallbackPrice: 60000, rating: "4.6 (60+)", img: "/images/routes/mzuzu-kasungu.jpg" },
  { route: "Karonga - Mzuzu", buses: "Travel With Us Today", fallbackPrice: 45000, rating: "4.5 (50+)", img: "/images/routes/mzuzu-karonga.jpg" },
];

type PopularRoutesSectionProps = {
  routePrices: Record<string, number>;
  onBookRoute: (route: string) => void;
  onCustomize: () => void;
};

export default function PopularRoutesSection({ routePrices, onBookRoute, onCustomize }: PopularRoutesSectionProps) {
  return (
    <section id="routes" className="scroll-mt-24 border-t border-slate-100 bg-white px-4 py-12 sm:border-t-0 sm:py-12">
      <div className="mx-auto max-w-7xl">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#0f3f78]">Popular Routes</p>
            <h2 className="mt-1 text-2xl font-black sm:text-3xl">Top Destinations</h2>
          </div>
          <a href="#routes" className="shrink-0 rounded-lg px-2 py-2 text-xs font-bold text-[#0f3f78] transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 sm:text-sm">
            View all routes →
          </a>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {ROUTES_DATA.map((route) => {
            const fare = routePrices[route.route] || route.fallbackPrice;
            return (
              <article key={route.route} className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition duration-200 hover:-translate-y-1 hover:border-blue-200 hover:shadow-lg">
                <Image
                  src={route.img}
                  width={420}
                  height={170}
                  sizes="(max-width: 767px) 50vw, (max-width: 1023px) 33vw, (max-width: 1279px) 25vw, 17vw"
                  className="h-24 w-full object-cover transition duration-500 group-hover:scale-105 sm:h-28"
                  alt={route.route}
                />
                <div className="flex flex-1 flex-col p-3">
                  <h3 className="text-sm font-black leading-5 text-slate-900">{route.route}</h3>
                  <p className="mt-1 truncate text-[11px] text-slate-500">{route.buses}</p>
                  <p className="mt-1 text-xs font-black text-[#0f3f78]">Fare {formatMwk(fare)}</p>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-[10px] font-bold text-amber-600">★ {route.rating}</span>
                    <button
                      onClick={() => onBookRoute(route.route)}
                      className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[#0f3f78] px-3 py-2 text-xs font-black text-[#0f3f78] transition hover:bg-[#0f3f78] hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100"
                    >
                      Book Now
                    </button>
                  </div>
                </div>
              </article>
            );
          })}

          <article className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition duration-200 hover:-translate-y-1 hover:border-blue-200 hover:shadow-lg">
            <div className="grid h-24 place-items-center bg-[linear-gradient(135deg,#071f3d,#155ea6)] text-white sm:h-28">
              <div className="grid h-12 w-12 place-items-center rounded-xl border border-white/20 bg-white/10 transition group-hover:scale-105">
                <IconRoute className="h-6 w-6" title="Customized route" />
              </div>
            </div>
            <div className="flex flex-1 flex-col p-3">
              <h3 className="text-sm font-black leading-5 text-slate-900">Customized Route</h3>
              <p className="mt-1 text-[11px] leading-4 text-slate-500">Choose your own departure district and university destination.</p>
              <button
                type="button"
                onClick={onCustomize}
                className="mt-auto inline-flex min-h-11 items-center justify-center rounded-lg border border-[#0f3f78] px-3 py-2 text-xs font-black text-[#0f3f78] transition hover:bg-[#0f3f78] hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100"
              >
                Customize Route
              </button>
            </div>
          </article>
        </div>

        <div className="mt-6 flex justify-center">
          <a
            href="#routes"
            className="inline-flex min-h-12 items-center justify-center rounded-full border border-[#0f3f78] px-6 text-sm font-black text-[#0f3f78] transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100"
          >
            View All Routes
          </a>
        </div>
      </div>
    </section>
  );
}
