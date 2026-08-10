"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import OperatorAuthShell from "../_components/OperatorAuthShell";

const inputClass =
  "w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-[#0A4D8C] focus:ring-4 focus:ring-[#0A4D8C]/10";
const labelClass = "mb-1 block text-sm font-semibold text-slate-700";

export default function OperatorRegisterPage() {
  const [legalName, setLegalName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isIndividual, setIsIndividual] = useState(false);
  const [ownerFullName, setOwnerFullName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [ownerConfirmPassword, setOwnerConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/operators/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          legalName,
          displayName,
          isIndividual,
          ownerFullName,
          ownerEmail,
          ownerPhone,
          ownerPassword,
          ownerConfirmPassword,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        setError(result.error || "Registration failed");
        setLoading(false);
        return;
      }

      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <OperatorAuthShell
        eyebrow="Operator Portal"
        headline="Grow your transport business with us."
        description="You keep operating your own vehicles. We bring you customers, bookings, and payments."
      >
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#0A4D8C]">Application submitted</p>
          <h2 className="mt-2 text-2xl font-black text-slate-900">You&apos;re all set</h2>
          <p className="mt-3 text-sm text-slate-600">
            Sign in now to track your application status. Our team reviews new operator applications and will follow
            up with next steps.
          </p>
          <Link
            href="/operator/login"
            className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-[#0A4D8C] px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-[#083a6b]"
          >
            Go to sign in
          </Link>
        </div>
      </OperatorAuthShell>
    );
  }

  return (
    <OperatorAuthShell
      eyebrow="Operator Portal"
      headline="Grow your transport business with us."
      description="You keep operating your own vehicles. We bring you customers, bookings, and payments — apply below to get started."
    >
      <form onSubmit={handleSubmit} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 text-center lg:text-left">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#0A4D8C]">Become an operator</p>
          <h2 className="mt-2 text-2xl font-black text-slate-900">Apply to list your service</h2>
        </div>

        {error && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div className="space-y-4">
          <div>
            <label className={labelClass}>Business / legal name</label>
            <input className={inputClass} required value={legalName} onChange={(e) => setLegalName(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Display name (shown to travellers)</label>
            <input className={inputClass} required value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={isIndividual} onChange={(e) => setIsIndividual(e.target.checked)} />
            I&apos;m an individual vehicle owner, not a registered business
          </label>

          <hr className="border-slate-200" />

          <div>
            <label className={labelClass}>Your full name (account owner)</label>
            <input className={inputClass} required value={ownerFullName} onChange={(e) => setOwnerFullName(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Email</label>
              <input type="email" className={inputClass} required value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Phone</label>
              <input className={inputClass} required value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Password</label>
              <input type="password" className={inputClass} required minLength={8} value={ownerPassword} onChange={(e) => setOwnerPassword(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Confirm password</label>
              <input
                type="password"
                className={inputClass}
                required
                minLength={8}
                value={ownerConfirmPassword}
                onChange={(e) => setOwnerConfirmPassword(e.target.value)}
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-2xl bg-[#0A4D8C] px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-[#083a6b] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Submitting…" : "Submit application"}
        </button>

        <p className="mt-4 text-center text-sm text-slate-600">
          Already applied?{" "}
          <Link href="/operator/login" className="font-semibold text-[#0A4D8C] hover:text-[#083a6b]">
            Sign in
          </Link>
        </p>
      </form>
    </OperatorAuthShell>
  );
}
