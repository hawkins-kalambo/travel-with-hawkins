"use client";

import { useEffect } from "react";
import Link from "next/link";
import { logError } from "@/lib/logger";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logError("Unhandled render error", {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="page-shell flex min-h-screen items-center justify-center bg-off-white px-4">
      <div className="surface-card w-full max-w-lg p-8 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-danger">Error</p>
        <h1 className="mt-3 text-3xl font-extrabold text-gray-800">Something went wrong</h1>
        <p className="mt-3 text-gray-600">
          This page hit an unexpected error. Try again, or head back to the main experience.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button onClick={reset} className="btn-primary">
            Try again
          </button>
          <Link href="/" className="btn-secondary">
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}
