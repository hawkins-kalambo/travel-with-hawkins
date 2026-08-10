import type { ReactNode } from "react";
import Image from "next/image";

// Shared branded shell for /operator/register and /operator/login — same
// split-screen pattern as the admin/ambassador login pages (gradient brand
// panel + form card), so the operator portal reads as part of the same
// product rather than a bolted-on afterthought. Responsive via lg:flex-row:
// stacks to a single column on mobile, brand panel on top.
export default function OperatorAuthShell({
  eyebrow,
  headline,
  description,
  children,
}: {
  eyebrow: string;
  headline: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(10,77,140,0.08)] lg:flex-row">
        <div className="flex flex-1 flex-col justify-center bg-[linear-gradient(135deg,#0A4D8C_0%,#0f3f78_55%,#F7931E_100%)] p-8 text-white sm:p-12 lg:w-[45%]">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" width={56} height={56} className="rounded-full object-cover" alt="Travel with Hawkins logo" />
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-100">Travel with Hawkins</p>
              <p className="text-lg font-semibold text-white">{eyebrow}</p>
            </div>
          </div>
          <div className="mt-10 max-w-md">
            <h1 className="text-3xl font-black leading-tight sm:text-4xl">{headline}</h1>
            <p className="mt-4 text-base text-slate-100/90">{description}</p>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center p-6 sm:p-8 lg:p-10">
          <div className="w-full max-w-md">{children}</div>
        </div>
      </div>
    </div>
  );
}
