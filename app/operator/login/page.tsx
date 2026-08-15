"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import OperatorAuthShell from "../_components/OperatorAuthShell";

const inputClass =
  "w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-[#0A4D8C] focus:ring-4 focus:ring-[#0A4D8C]/10";
const labelClass = "mb-1 block text-sm font-semibold text-slate-700";

export default function OperatorLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/operators/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const result = await response.json();

      if (!result.success) {
        setError(result.error || "Login failed");
        setLoading(false);
        return;
      }

      window.location.assign("/operator");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <OperatorAuthShell
      eyebrow="Operator Portal"
      headline="Welcome back."
      description="Sign in to manage your vehicles, drivers, documents, and bookings."
    >
      <form onSubmit={handleSubmit} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 text-center lg:text-left">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#0A4D8C]">Operator Portal</p>
          <h2 className="mt-2 text-2xl font-black text-slate-900">Sign in to your account</h2>
        </div>

        {error && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div className="space-y-4">
          <div>
            <label className={labelClass}>Email</label>
            <input type="email" className={inputClass} required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <div>
            <label className={labelClass}>Password</label>
            <input
              type="password"
              className={inputClass}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-2xl bg-[#0A4D8C] px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-[#083a6b] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>

        <p className="mt-4 text-center text-sm text-slate-600">
          Not registered yet?{" "}
          <Link href="/operator/register" className="font-semibold text-[#0A4D8C] hover:text-[#083a6b]">
            Apply as an operator
          </Link>
        </p>
      </form>
    </OperatorAuthShell>
  );
}
