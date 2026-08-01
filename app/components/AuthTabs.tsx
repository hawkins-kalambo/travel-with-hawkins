import Link from "next/link";

type AuthTabsProps = {
  active: "signin" | "signup";
};

export default function AuthTabs({ active }: AuthTabsProps) {
  const tabClass = (tab: "signin" | "signup") =>
    `flex-1 rounded-xl px-4 py-2.5 text-center text-sm font-semibold transition ${
      active === tab
        ? "bg-white text-[#0A4D8C] shadow-sm"
        : "text-slate-500 hover:text-slate-700"
    }`;

  return (
    <div className="mb-6 flex gap-1 rounded-2xl bg-slate-100 p-1" role="tablist" aria-label="Sign in or create account">
      <Link href="/customer/register" role="tab" aria-selected={active === "signup"} className={tabClass("signup")}>
        Create Account
      </Link>
      <Link href="/customer/login" role="tab" aria-selected={active === "signin"} className={tabClass("signin")}>
        Sign In
      </Link>
    </div>
  );
}
