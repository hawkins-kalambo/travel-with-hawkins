import Link from "next/link";

export default function CommissionRatesConfigPage() {
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#0f3f78]">Commission Rates</p>
              <h1 className="text-3xl font-black text-slate-900">Route commission management</h1>
              <p className="mt-2 text-sm text-slate-500">Manage fixed and percentage commissions for each route and preserve historical commission values for bookings.</p>
            </div>
            <Link
              href="/admin/business-configuration"
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Back to Business Configuration
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900 mb-3">Commission settings</h2>
          <p className="text-sm text-slate-500 mb-6">Use the dedicated commission rule editor to configure rates. The booking engine will automatically use these rules to calculate and store commissions permanently for each referral booking.</p>
          <Link
            href="/admin/commission-rates"
            className="inline-flex items-center justify-center rounded-lg bg-[#0f3f78] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0a2d56]"
          >
            Open Commission Rates page
          </Link>
        </div>
      </div>
    </div>
  );
}
