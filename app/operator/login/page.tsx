"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

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
    <div className="page-shell flex min-h-screen items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="surface-card w-full max-w-md p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-primary-600">Operator portal</p>
        <h1 className="mt-2 text-2xl font-extrabold text-gray-800">Sign in</h1>

        {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        <div className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
            <input type="email" className="input-field" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Password</label>
            <input type="password" className="input-field" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        </div>

        <button type="submit" disabled={loading} className="btn-primary mt-6 w-full">
          {loading ? "Signing in…" : "Sign in"}
        </button>

        <p className="mt-4 text-center text-sm text-gray-600">
          Not registered yet?{" "}
          <Link href="/operator/register" className="font-semibold text-primary-600">
            Apply as an operator
          </Link>
        </p>
      </form>
    </div>
  );
}
