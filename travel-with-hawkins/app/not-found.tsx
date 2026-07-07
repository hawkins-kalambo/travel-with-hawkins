import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-lg w-full bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
        <h1 className="text-3xl font-extrabold text-[#1a0f00]">404</h1>
        <p className="mt-2 text-slate-600">
          This page could not be found.
        </p>
        <div className="mt-6 flex gap-3">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-xl bg-[#1a0f00] text-white px-5 py-2.5 text-sm font-semibold hover:bg-[#c94f00]"
          >
            Go Home
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-800 px-5 py-2.5 text-sm font-semibold hover:bg-slate-50"
          >
            Admin Login
          </Link>
        </div>
      </div>
    </div>
  );
}

