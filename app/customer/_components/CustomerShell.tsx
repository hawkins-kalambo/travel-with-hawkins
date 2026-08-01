"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Ticket,
  MessageCircle,
  UserCircle,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronDown,
} from "lucide-react";
import { logout } from "@/lib/auth";
import type { CustomerProfile } from "@/lib/customerAuth";

type NavKey = "dashboard" | "bookings" | "messages" | "profile" | "settings";

const NAV_ITEMS: { key: NavKey; label: string; href: string; icon: typeof LayoutDashboard }[] = [
  { key: "dashboard", label: "Dashboard", href: "/customer/dashboard", icon: LayoutDashboard },
  { key: "bookings", label: "My Bookings", href: "/customer/dashboard#bookings", icon: Ticket },
  { key: "messages", label: "Messages", href: "/customer/messages", icon: MessageCircle },
  { key: "profile", label: "Profile", href: "/customer/profile", icon: UserCircle },
  { key: "settings", label: "Settings", href: "/customer/settings", icon: Settings },
];

export default function CustomerShell({
  active,
  profile,
  unreadCount = 0,
  title,
  subtitle,
  children,
}: {
  active: NavKey;
  profile: CustomerProfile | null;
  unreadCount?: number;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  const initials = (profile?.fullName || "You")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <div className="min-h-screen bg-[#f3f7fb]">
      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <Link href="/customer/dashboard" className="flex items-center gap-2">
          <Image src="/logo.png" width={32} height={32} className="rounded-full object-cover" alt="Travel with Hawkins" />
          <span className="text-sm font-black text-[#0A4D8C]">Travel with Hawkins</span>
        </Link>
        <button
          onClick={() => setMobileNavOpen((open) => !open)}
          className="rounded-xl border border-slate-200 p-2 text-slate-700"
          aria-label="Toggle navigation"
        >
          {mobileNavOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      <div className="mx-auto flex max-w-[1600px]">
        {/* Sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-72 transform bg-gradient-to-b from-[#0A4D8C] to-[#082f57] transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
            mobileNavOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-full flex-col px-5 py-6">
            <Link href="/customer/dashboard" className="mb-8 hidden items-center gap-3 px-1 lg:flex">
              <Image src="/logo.png" width={40} height={40} className="rounded-full object-cover ring-2 ring-white/20" alt="Travel with Hawkins" />
              <div>
                <p className="text-sm font-black leading-tight text-white">Travel with Hawkins</p>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/50">Customer Portal</p>
              </div>
            </Link>

            <nav className="flex-1 space-y-1">
              {NAV_ITEMS.map((item) => {
                const isActive = item.key === active;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    onClick={() => setMobileNavOpen(false)}
                    className={`group flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                      isActive ? "bg-white text-[#0A4D8C] shadow-lg shadow-black/10" : "text-white/75 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <Icon size={18} strokeWidth={2.25} />
                      {item.label}
                    </span>
                    {item.key === "messages" && unreadCount > 0 ? (
                      <span
                        className={`inline-flex min-w-[22px] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
                          isActive ? "bg-[#0A4D8C] text-white" : "bg-[#F7931E] text-white"
                        }`}
                      >
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-6 space-y-3 border-t border-white/10 pt-5">
              <Link
                href="/book"
                className="flex items-center justify-center gap-2 rounded-2xl bg-[#F7931E] px-4 py-3 text-sm font-bold text-white shadow-lg shadow-black/10 transition hover:bg-[#e67e0f]"
              >
                Book a New Trip
              </Link>
              <button
                onClick={() => void handleLogout()}
                className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                <LogOut size={18} strokeWidth={2.25} />
                Sign out
              </button>
            </div>
          </div>
        </aside>

        {mobileNavOpen ? (
          <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setMobileNavOpen(false)} />
        ) : null}

        {/* Main column */}
        <div className="min-h-screen flex-1">
          {/* Desktop topbar */}
          <header className="sticky top-0 z-20 hidden border-b border-slate-200 bg-white/90 px-8 py-5 backdrop-blur lg:block">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-black text-slate-900">{title}</h1>
                {subtitle ? <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p> : null}
              </div>

              <div className="flex items-center gap-3">
                <Link
                  href="/customer/messages"
                  className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition hover:border-[#0A4D8C]/30 hover:text-[#0A4D8C]"
                  aria-label="Messages"
                >
                  <MessageCircle size={19} strokeWidth={2.25} />
                  {unreadCount > 0 ? (
                    <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#F7931E] px-1 text-[10px] font-bold text-white ring-2 ring-white">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  ) : null}
                </Link>

                <div className="relative">
                  <button
                    onClick={() => setMenuOpen((open) => !open)}
                    className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white py-1.5 pl-1.5 pr-3 hover:bg-slate-50"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#0A4D8C] to-[#F7931E] text-xs font-bold text-white">
                      {initials || "YOU"}
                    </span>
                    <span className="text-sm font-semibold text-slate-700">{profile?.fullName?.split(" ")[0] || "Account"}</span>
                    <ChevronDown size={16} className="text-slate-400" />
                  </button>

                  {menuOpen ? (
                    <div className="absolute right-0 top-full mt-2 w-52 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                      <Link href="/customer/profile" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                        <UserCircle size={16} /> My Profile
                      </Link>
                      <Link href="/customer/settings" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                        <Settings size={16} /> Settings
                      </Link>
                      <button
                        onClick={() => void handleLogout()}
                        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-red-600 hover:bg-red-50"
                      >
                        <LogOut size={16} /> Sign out
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </header>

          <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
