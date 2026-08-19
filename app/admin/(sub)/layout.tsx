"use client";

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { authFetch, logout } from "@/lib/auth";

const NAV_LINKS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/trips", label: "Trips" },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/students", label: "Students" },
  { href: "/admin/operators", label: "Operators" },
  { href: "/admin/applications", label: "Applications" },
  { href: "/admin/ambassadors", label: "Ambassadors" },
  { href: "/admin/referral-bookings", label: "Referral bookings" },
  { href: "/admin/referrals", label: "Referrals" },
  { href: "/admin/commission-rates", label: "Commission rates" },
  { href: "/admin/business-configuration", label: "Business configuration" },
  { href: "/admin/communication", label: "Communication" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/broadcast", label: "Broadcast" },
  { href: "/admin/settings", label: "Settings" },
] as const;

const UNIVERSITY_ADMIN_NAV_LINKS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/trips", label: "Trips" },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/business-configuration/routes-and-fares", label: "Routes & pickup points" },
  { href: "/admin/applications", label: "Applications" },
  { href: "/admin/ambassadors", label: "Ambassadors" },
  { href: "/admin/referral-bookings", label: "Referral bookings" },
  { href: "/admin/reports", label: "Reports" },
] as const;

/**
 * Shared nav shell for every admin page, including /admin itself (this
 * layout lives at app/admin/(sub)/layout.tsx and app/admin/(sub)/page.tsx
 * is the Overview page — the route group adds no URL segment, so that
 * file serves /admin directly, wrapped here same as every other admin
 * route). Previously each sub-page was an orphaned route with just a
 * "Back to admin" link and no persistent navigation, and /admin was a
 * 2,425-line monolith with its own separate sidebar; both are gone now.
 */
export default function AdminSubLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState<string | undefined>(undefined);

  useEffect(() => {
    void authFetch("/api/profile")
      .then(async (response) => response.json() as Promise<{ profile?: { role?: string } }>)
      .then((body) => setRole(body.profile?.role))
      .catch(() => undefined);
  }, []);

  const isUniversityAdmin = role === "university_admin";
  const isSuperAdmin = role === "super_admin";
  // "admin" here covers both the legacy admins-table "admin" row and any
  // other non-university/non-viewer admin role — same set NAV_LINKS already
  // targets. Users is super_admin-only (mirrors canAccessAdminRoute in
  // lib/supabaseServer.ts and the manageUsers permission gate on the API);
  // Incidents/Feature flags are admin+super_admin, matching how every other
  // NAV_LINKS entry below is already scoped away from university_admin.
  const visibleLinks = isUniversityAdmin
    ? UNIVERSITY_ADMIN_NAV_LINKS
    : [
        ...NAV_LINKS,
        { href: "/admin/incidents", label: "Incidents" },
        { href: "/admin/feature-flags", label: "Feature flags" },
        ...(isSuperAdmin ? [{ href: "/admin/users", label: "Users" }] : []),
      ];

  const handleLogout = async () => {
    await logout();
    router.push("/admin/login");
  };

  // Applies across every admin page now that they all route through this
  // layout. Previously lived only in the old monolith's page-shell code,
  // so the six pages already extracted from it before this one had no
  // idle auto-logout at all — restoring it here for all of them at once
  // rather than leaving that gap in place.
  useEffect(() => {
    const idleMs = 15 * 60 * 1000;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const resetTimer = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void logout().then(() => router.push("/admin/login"));
      }, idleMs);
    };

    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;
    events.forEach((event) => window.addEventListener(event, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      events.forEach((event) => window.removeEventListener(event, resetTimer));
      if (timer) clearTimeout(timer);
    };
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-100 lg:flex">
      <aside className="border-b border-white/10 bg-linear-to-br from-primary-800 to-primary-700 text-white lg:min-h-screen lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-3 px-4 py-5">
          <Image src="/logo.png" width={40} height={40} className="h-10 w-10 rounded-full object-cover ring-2 ring-white/20" alt="Travel with Hawkins logo" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/70">Admin Panel</p>
            <p className="text-sm font-semibold">Travel with Hawkins</p>
          </div>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 pb-4 lg:flex-col lg:overflow-visible lg:pb-6">
          {visibleLinks.map((link) => {
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
