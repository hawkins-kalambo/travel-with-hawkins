"use client";

import Image from "next/image";
import Link from "next/link";
import { logout } from "@/lib/auth";

// Branded header for the operator portal, matching the logo + gradient
// language used across admin/ambassador/customer — a simple sticky topbar
// rather than CustomerShell's full sidebar, since the operator portal is
// still a single page (Fleet + Documents); grows into a sidebar naturally
// once there's more than one destination to navigate between.
export default function OperatorHeader({ displayName, staffRole }: { displayName: string; staffRole: string }) {
  const handleLogout = async () => {
    await logout();
    window.location.assign("/operator/login");
  };

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/operator" className="flex min-w-0 items-center gap-3">
          <Image src="/logo.png" width={40} height={40} className="h-10 w-10 shrink-0 rounded-full object-cover" alt="Travel with Hawkins logo" />
          <div className="min-w-0">
            <p className="truncate text-sm font-black leading-tight text-slate-900">{displayName}</p>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Operator Portal · {staffRole.replace("_", " ")}</p>
          </div>
        </Link>
        <button
          onClick={() => void handleLogout()}
          className="shrink-0 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-[#0A4D8C]/30 hover:text-[#0A4D8C]"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
