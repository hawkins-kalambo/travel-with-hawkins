import Link from "next/link";

export default function NotFound() {
  return (
    <div className="page-shell flex min-h-screen items-center justify-center bg-off-white px-4">
      <div className="surface-card w-full max-w-lg p-8 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-primary-600">404</p>
        <h1 className="mt-3 text-3xl font-extrabold text-gray-800">Page not found</h1>
        <p className="mt-3 text-gray-600">
          This page could not be found. Return to the main experience and continue your journey.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/" className="btn-primary">
            Go Home
          </Link>
          <Link href="/login" className="btn-secondary">
            Admin Login
          </Link>
        </div>
      </div>
    </div>
  );
}

