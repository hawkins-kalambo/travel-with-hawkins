"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

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
      <div className="page-shell flex min-h-screen items-center justify-center px-4">
        <div className="surface-card w-full max-w-lg p-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-primary-600">Application submitted</p>
          <h1 className="mt-3 text-2xl font-extrabold text-gray-800">Check your email</h1>
          <p className="mt-3 text-gray-600">
            Confirm your email address, then sign in to track your application status. Our team reviews new operator applications and will follow up with next steps.
          </p>
          <Link href="/operator/login" className="btn-primary mt-6 inline-flex">
            Go to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell flex min-h-screen items-center justify-center px-4 py-10">
      <form onSubmit={handleSubmit} className="surface-card w-full max-w-xl p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-primary-600">Become an operator</p>
        <h1 className="mt-2 text-2xl font-extrabold text-gray-800">Apply to list on Travel With Hawkins</h1>
        <p className="mt-2 text-sm text-gray-600">
          You keep operating your own vehicles. We help travellers discover, book, and pay for your service.
        </p>

        {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        <div className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Business / legal name</label>
            <input className="input-field" required value={legalName} onChange={(e) => setLegalName(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Display name (shown to travellers)</label>
            <input className="input-field" required value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={isIndividual} onChange={(e) => setIsIndividual(e.target.checked)} />
            I&apos;m an individual vehicle owner, not a registered business
          </label>

          <hr className="border-gray-200" />

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Your full name (account owner)</label>
            <input className="input-field" required value={ownerFullName} onChange={(e) => setOwnerFullName(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
            <input type="email" className="input-field" required value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Phone</label>
            <input className="input-field" required value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Password</label>
            <input type="password" className="input-field" required minLength={8} value={ownerPassword} onChange={(e) => setOwnerPassword(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Confirm password</label>
            <input
              type="password"
              className="input-field"
              required
              minLength={8}
              value={ownerConfirmPassword}
              onChange={(e) => setOwnerConfirmPassword(e.target.value)}
            />
          </div>
        </div>

        <button type="submit" disabled={loading} className="btn-primary mt-6 w-full">
          {loading ? "Submitting…" : "Submit application"}
        </button>

        <p className="mt-4 text-center text-sm text-gray-600">
          Already applied?{" "}
          <Link href="/operator/login" className="font-semibold text-primary-600">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
