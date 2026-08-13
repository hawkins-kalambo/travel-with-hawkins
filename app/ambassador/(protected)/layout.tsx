"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { logout } from "@/lib/auth";

const NAV_LINKS = [
  { href: "/ambassador/dashboard", label: "Dashboard" },
  { href: "/ambassador/commissions", label: "Commissions" },
  { href: "/ambassador/customers", label: "Customers" },
  { href: "/ambassador/communication", label: "Communication" },
  { href: "/ambassador/profile", label: "Profile" },
] as const;

/**
 * Shared shell for the whole ambassador portal — previously every page
 * under here (dashboard/commissions/customers/profile/application-status,
 * plus communication once moved in) reimplemented its own header and
 * logout button independently, with two different (and inconsistent)
 * logout implementations. This is the one place that logic lives now.
 */
export default function AmbassadorPortalLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push("/ambassador/login");
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" width={40} height={40} className="h-10 w-10 rounded-xl object-cover" alt="Travel with Hawkins logo" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary-700">Ambassador Portal</p>
              <p className="text-sm text-gray-500">Travel with Hawkins</p>
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-1">
            {NAV_LINKS.map((link) => {
              const active = pathname?.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    active ? "bg-primary-700 text-white" : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
            <Link href="/" className="rounded-lg px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100">
              Home
            </Link>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-danger hover:bg-danger/10"
            >
              Logout
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6">{children}</main>
    </div>
  );
}
