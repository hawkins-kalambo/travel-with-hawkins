"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { logout } from "@/lib/auth";

const NAV_LINKS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/applications", label: "Applications" },
  { href: "/admin/ambassadors", label: "Ambassadors" },
  { href: "/admin/referral-bookings", label: "Referral bookings" },
  { href: "/admin/commission-rates", label: "Commission rates" },
  { href: "/admin/business-configuration", label: "Business configuration" },
  { href: "/admin/communication", label: "Communication" },
  { href: "/admin/reports", label: "Reports" },
] as const;

/**
 * Shared nav shell for the admin sub-pages (applications, ambassadors,
 * referral-bookings, commission-rates, business-configuration,
 * communication) — previously each of these was an orphaned route with
 * just a "Back to admin" link and no persistent navigation. Deliberately
 * does NOT wrap /admin itself (app/admin/page.tsx, outside this route
 * group) — that page keeps its own existing internal sidebar untouched.
 */
export default function AdminSubLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push("/admin/login");
  };

  return (
    <div className="min-h-screen bg-gray-100 lg:flex">
      <aside className="border-b border-white/10 bg-linear-to-br from-primary-800 to-primary-700 text-white lg:min-h-screen lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-3 px-4 py-5">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-sm font-black">TW</div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/70">Admin Panel</p>
            <p className="text-sm font-semibold">Travel with Hawkins</p>
          </div>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 pb-4 lg:flex-col lg:overflow-visible lg:pb-6">
          {NAV_LINKS.map((link) => {
            const active = link.href === "/admin" ? pathname === "/admin" : pathname?.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`shrink-0 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                  active ? "bg-white/15 text-white" : "text-white/75 hover:bg-white/10 hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 px-3 py-4">
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-red-200 transition hover:bg-red-900/30 lg:text-left"
          >
            Logout
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <main className="mx-auto w-full min-w-0 max-w-7xl px-4 py-6 md:px-6">{children}</main>
      </div>
    </div>
  );
}
