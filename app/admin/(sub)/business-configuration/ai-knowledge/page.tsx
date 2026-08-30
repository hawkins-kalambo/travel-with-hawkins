"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  loadAiKnowledge, createAiKnowledge, updateAiKnowledge, deleteAiKnowledge,
  type AiKnowledgeEntry, type AiKnowledgeCategory,
} from "@/app/admin/(sub)/business-configuration/businessConfigClient";

const CATEGORIES: AiKnowledgeCategory[] = [
  "general", "faq", "booking", "booking_fee", "payment", "cancellation", "luggage",
  "pickup", "business_info", "contact", "student_travel", "university_travel", "support",
];

function emptyDraft() {
  return {
    topic: "", category: "faq" as AiKnowledgeCategory, language: "en" as "en" | "ny",
    approvedAnswer: "", exampleQuestions: "", keywords: "", priority: "100",
    requiresLiveData: false,
  };
}

export default function AiKnowledgePage() {
  const [entries, setEntries] = useState<AiKnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft());
  const [filter, setFilter] = useState<"all" | "active" | "inactive" | "review">("all");

  const refresh = async (f = filter) => {
    setEntries(await loadAiKnowledge(f === "all" ? undefined : f));
  };

  useEffect(() => {
    const run = async () => {
      try {
        setEntries(await loadAiKnowledge());
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, []);

  const flash = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(null), 3000);
  };

  const add = async () => {
    if (!draft.topic.trim() || !draft.approvedAnswer.trim()) {
      setError("Topic and approved answer are required.");
      return;
    }
    setSaving("new");
    setError(null);
    try {
      await createAiKnowledge({
        ...draft, priority: Number(draft.priority) || 100,
      });
      setDraft(emptyDraft());
      await refresh();
      flash("Entry added as a draft — review it, then activate.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  };

  const patch = async (id: string, changes: Record<string, unknown>) => {
    setSaving(id);
    setError(null);
    try {
      const updated = await updateAiKnowledge({ id, ...changes });
      setEntries((cur) => cur.map((e) => (e.id === id ? updated : e)));
      flash("Entry updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  };

  const remove = async (id: string) => {
    setSaving(id);
    try {
      await deleteAiKnowledge(id);
      setEntries((cur) => cur.filter((e) => e.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  };

  const setLocal = (id: string, changes: Partial<AiKnowledgeEntry>) =>
    setEntries((cur) => cur.map((e) => (e.id === id ? { ...e, ...changes } : e)));

  const visible = filter === "all" ? entries
    : filter === "active" ? entries.filter((e) => e.is_active)
    : filter === "inactive" ? entries.filter((e) => !e.is_active)
    : entries.filter((e) => e.requires_review);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#0f3f78]">AI Knowledge</p>
              <h1 className="text-3xl font-black text-slate-900">Approved assistant answers</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-500">
                The WhatsApp assistant searches these before giving any general business answer. It may rephrase an
                approved answer but never invents one. New entries and Chichewa wording start as inactive drafts —
                activate only after review. Anything dynamic (fares, schedules, a customer&apos;s booking) must use
                &quot;Needs live data&quot; so the assistant calls a live tool instead.
              </p>
            </div>
            <Link href="/admin/business-configuration" className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50">
              Back to Business Configuration
            </Link>
          </div>
        </div>

        {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{message}</div>}
        {error && <div className="rounded-2xl border border-danger/20 bg-danger/10 p-4 text-sm text-danger">{error}</div>}

        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5">
          <h2 className="mb-3 font-bold text-slate-900">Add an entry</h2>
          <div className="grid gap-3 md:grid-cols-3">
            <input value={draft.topic} onChange={(e) => setDraft({ ...draft, topic: e.target.value })} placeholder="Topic" className="input-field md:col-span-2 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as AiKnowledgeCategory })} className="input-field rounded-xl border border-slate-200 px-3 py-2 text-sm">
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <textarea value={draft.approvedAnswer} onChange={(e) => setDraft({ ...draft, approvedAnswer: e.target.value })} placeholder="Approved answer (the assistant may rephrase this)" rows={3} className="input-field md:col-span-3 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <input value={draft.exampleQuestions} onChange={(e) => setDraft({ ...draft, exampleQuestions: e.target.value })} placeholder="Example questions (one per line)" className="input-field md:col-span-2 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <input value={draft.keywords} onChange={(e) => setDraft({ ...draft, keywords: e.target.value })} placeholder="Keywords" className="input-field rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <select value={draft.language} onChange={(e) => setDraft({ ...draft, language: e.target.value as "en" | "ny" })} className="input-field rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="en">English</option>
              <option value="ny">Chichewa</option>
            </select>
            <input type="number" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })} placeholder="Priority" className="input-field rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={draft.requiresLiveData} onChange={(e) => setDraft({ ...draft, requiresLiveData: e.target.checked })} className="h-4 w-4" />
              Needs live data
            </label>
          </div>
          <button onClick={add} disabled={saving === "new"} className="mt-3 rounded-lg bg-[#0f3f78] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {saving === "new" ? "Adding…" : "Add draft entry"}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {(["all", "active", "inactive", "review"] as const).map((f) => (
            <button key={f} onClick={() => { setFilter(f); void refresh(f); }}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${filter === f ? "border-[#0f3f78] bg-[#0f3f78] text-white" : "border-slate-300 bg-white text-slate-700"}`}>
              {f === "review" ? "Needs review" : f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {loading ? <p className="text-sm text-slate-500">Loading…</p> : visible.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No entries.</p>
        ) : (
          <div className="space-y-3">
            {visible.map((e) => (
              <div key={e.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <input value={e.topic} onChange={(ev) => setLocal(e.id, { topic: ev.target.value })} className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm font-bold text-slate-900" />
                    <p className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 font-semibold uppercase">{e.category}</span>
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 font-semibold uppercase">{e.language}</span>
                      <span>v{e.version}</span>
                      {e.requires_review && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">needs review</span>}
                      {e.requires_live_data && <span className="rounded-full bg-sky-100 px-2 py-0.5 font-semibold text-sky-800">live data</span>}
                      <span className={`rounded-full px-2 py-0.5 font-semibold ${e.is_active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}`}>{e.is_active ? "active" : "inactive"}</span>
                    </p>
                  </div>
                  <button onClick={() => remove(e.id)} disabled={saving === e.id} className="rounded-full border border-danger/30 bg-white px-3 py-1 text-xs font-semibold text-danger disabled:opacity-40">Delete</button>
                </div>
                <textarea value={e.approved_answer} onChange={(ev) => setLocal(e.id, { approved_answer: ev.target.value })} rows={3} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <input value={e.keywords} onChange={(ev) => setLocal(e.id, { keywords: ev.target.value })} placeholder="Keywords" className="rounded-lg border border-slate-200 px-2 py-1 text-xs" />
                  <input value={e.example_questions} onChange={(ev) => setLocal(e.id, { example_questions: ev.target.value })} placeholder="Example questions" className="rounded-lg border border-slate-200 px-2 py-1 text-xs" />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                  <label className="flex items-center gap-1"><input type="checkbox" checked={e.requires_live_data} onChange={(ev) => setLocal(e.id, { requires_live_data: ev.target.checked })} className="h-4 w-4" /> Needs live data</label>
                  <label className="flex items-center gap-1">Priority <input type="number" value={e.priority} onChange={(ev) => setLocal(e.id, { priority: Number(ev.target.value) || 0 })} className="w-16 rounded border border-slate-200 px-1 py-0.5" /></label>
                  <button onClick={() => patch(e.id, { topic: e.topic, approvedAnswer: e.approved_answer, keywords: e.keywords, exampleQuestions: e.example_questions, requiresLiveData: e.requires_live_data, priority: e.priority })} disabled={saving === e.id} className="rounded-lg border border-slate-300 bg-white px-3 py-1 font-semibold text-slate-700 disabled:opacity-60">Save changes</button>
                  <button onClick={() => patch(e.id, { isActive: !e.is_active })} disabled={saving === e.id} className={`rounded-lg px-3 py-1 font-semibold text-white disabled:opacity-60 ${e.is_active ? "bg-slate-500" : "bg-emerald-600"}`}>
                    {e.is_active ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
