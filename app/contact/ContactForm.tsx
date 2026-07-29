"use client";

import { useState, type FormEvent } from "react";

type FormStatus =
  | { type: "idle"; message: "" }
  | { type: "success" | "error"; message: string };

const initialFields = {
  name: "",
  email: "",
  subject: "",
  message: "",
};

export default function ContactForm() {
  const [fields, setFields] = useState(initialFields);
  const [status, setStatus] = useState<FormStatus>({ type: "idle", message: "" });
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setStatus({ type: "idle", message: "" });

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      const result = (await response.json()) as { message?: string; error?: string };

      if (!response.ok) {
        setStatus({
          type: "error",
          message: result.error || "We could not send your message. Please try again.",
        });
        return;
      }

      setFields(initialFields);
      setStatus({
        type: "success",
        message: result.message || "Thanks! Your message has been sent.",
      });
    } catch {
      setStatus({
        type: "error",
        message: "We could not send your message. Please check your connection and try again.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="text-sm font-bold text-slate-700">
          Name
          <input
            className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal outline-none transition focus:border-[#0f3f78] focus:ring-2 focus:ring-blue-100"
            name="name"
            value={fields.name}
            onChange={(event) => setFields({ ...fields, name: event.target.value })}
            maxLength={100}
            autoComplete="name"
            required
          />
        </label>
        <label className="text-sm font-bold text-slate-700">
          Email
          <input
            className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal outline-none transition focus:border-[#0f3f78] focus:ring-2 focus:ring-blue-100"
            name="email"
            type="email"
            value={fields.email}
            onChange={(event) => setFields({ ...fields, email: event.target.value })}
            maxLength={254}
            autoComplete="email"
            required
          />
        </label>
      </div>
      <label className="block text-sm font-bold text-slate-700">
        Subject
        <input
          className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal outline-none transition focus:border-[#0f3f78] focus:ring-2 focus:ring-blue-100"
          name="subject"
          value={fields.subject}
          onChange={(event) => setFields({ ...fields, subject: event.target.value })}
          maxLength={160}
          required
        />
      </label>
      <label className="block text-sm font-bold text-slate-700">
        Message
        <textarea
          className="mt-2 min-h-40 w-full resize-y rounded-xl border border-slate-300 px-4 py-3 font-normal outline-none transition focus:border-[#0f3f78] focus:ring-2 focus:ring-blue-100"
          name="message"
          value={fields.message}
          onChange={(event) => setFields({ ...fields, message: event.target.value })}
          maxLength={5_000}
          required
        />
      </label>

      {status.type !== "idle" && (
        <p
          className={`rounded-xl px-4 py-3 text-sm font-semibold ${
            status.type === "success"
              ? "bg-emerald-50 text-emerald-800"
              : "bg-red-50 text-red-800"
          }`}
          role="status"
          aria-live="polite"
        >
          {status.message}
        </p>
      )}

      <button
        className="rounded-xl bg-[#0f3f78] px-6 py-3 font-bold text-white transition hover:bg-[#0a2d56] disabled:cursor-not-allowed disabled:opacity-60"
        type="submit"
        disabled={submitting}
      >
        {submitting ? "Sending..." : "Send message"}
      </button>
    </form>
  );
}
