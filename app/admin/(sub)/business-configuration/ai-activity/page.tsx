"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  loadAiSummary, loadAiInteractions, reviewAiInteraction, createAiKnowledge,
  type AiQualitySummary, type AiInteraction,
} from "@/app/admin/(sub)/business-configuration/businessConfigClient";

function pct(v: number) { return `${Math.round(v * 100)}%`; }

export default function AiActivityPage() {
  const [summary, setSummary] = useState<AiQualitySummary | null>(null);
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [rows, setRows] = useState<AiInteraction[]>([]);
  const [filter, setFilter] = useState<"all" | "fallback" | "unreviewed">("unreviewed");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const fetchRows = (f: "all" | "fallback" | "unreviewed") =>
    loadAiInteractions(f === "fallback" ? { fallback: true } : f === "unreviewed" ? { unreviewed: true } : {});
  const loadRows = async (f = filter) => { setRows(await fetchRows(f)); };

  useEffect(() => {
    const run = async () => {
      try {
        const [s, initialRows] = await Promise.all([loadAiSummary(30), fetchRows("unreviewed")]);
        setSummary(s.summary);
        setFeatures(s.features);
        setRows(initialRows);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };
    void run();
  }, []);

  const review = async (id: string, fb: "correct" | "needs_improvement" | "unsafe") => {
    setBusy(id);
    try {
      const updated = await reviewAiInteraction(id, fb);
      setRows((cur) => cur.map((r) => (r.id === id ? updated : r)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const suggestKnowledge = async (r: AiInteraction) => {
    const q = (r.customer_message ?? "").trim();
    if (!q) return;
    setBusy(r.id);
    try {
      await createAiKnowledge({
        topic: q.slice(0, 140),
        category: "faq",
        exampleQuestions: q,
        approvedAnswer: "(draft — write the approved answer, then activate)",
        requiresReview: true,
        isActive: false,
      });
      setError(null);
      window.alert("Draft added to AI Knowledge — fill in the answer and activate it there.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#0f3f78]">AI Activity</p>
              <h1 className="text-3xl font-black text-slate-900">Assistant performance</h1>
              <p className="mt-2 text-sm text-slate-500">Last 30 days. Review answers that fell back or need attention.</p>
            </div>
            <Link href="/admin/business-configuration" className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50">
              Back to Business Configuration
            </Link>
          </div>
        </div>

        {error && <div className="rounded-2xl border border-danger/20 bg-danger/10 p-4 text-sm text-danger">{error}</div>}

        {summary && (
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {[
              ["Turns", String(summary.turns)],
              ["Fallback rate", pct(summary.fallbackRate)],
              ["Unknown intent", pct(summary.unknownIntentRate)],
              ["Clarifications", pct(summary.clarificationRate)],
              ["Human handover", pct(summary.humanHandoverRate)],
              ["Tool denied", String(summary.toolDenied)],
              ["Urgent", String(summary.urgent)],
              ["Avg response", summary.avgResponseMs == null ? "—" : `${summary.avgResponseMs} ms`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
                <p className="mt-2 text-2xl font-black text-slate-900">{value}</p>
              </div>
            ))}
          </div>
        )}

        {summary && summary.topIntents.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
            <span className="font-semibold text-slate-800">Top intents: </span>
            {summary.topIntents.map((i) => `${i.intent} (${i.count})`).join(" · ")}
            <span className="ml-3 font-semibold text-slate-800">Languages: </span>
            {Object.entries(summary.byLanguage).map(([l, c]) => `${l} (${c})`).join(" · ")}
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-600">
          <span className="font-semibold text-slate-800">Feature flags: </span>
          {Object.entries(features).map(([k, v]) => `${k}: ${v ? "on" : "off"}`).join(" · ") || "none read"}
        </div>

        <div className="flex flex-wrap gap-2">
          {(["unreviewed", "fallback", "all"] as const).map((f) => (
            <button key={f} onClick={() => { setFilter(f); void loadRows(f); }}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${filter === f ? "border-[#0f3f78] bg-[#0f3f78] text-white" : "border-slate-300 bg-white text-slate-700"}`}>
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {rows.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Nothing to show.</p>
          ) : rows.map((r) => (
            <div key={r.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-900">“{r.customer_message ?? "—"}”</p>
              <p className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                <span className="rounded-full bg-slate-200 px-2 py-0.5 font-semibold uppercase">{r.detected_intent ?? "unknown"}</span>
                <span className="rounded-full bg-slate-200 px-2 py-0.5">{r.detected_language ?? "?"}</span>
                <span>conf {r.confidence ?? "—"}</span>
                {r.allowed_tool && <span>tool {r.allowed_tool} → {r.tool_outcome}</span>}
                {r.model === "synthesis" && <span className="rounded-full bg-violet-100 px-2 py-0.5 font-semibold text-violet-800">synthesised</span>}
                {r.fallback_used && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">fallback</span>}
                {r.human_requested && <span className="rounded-full bg-sky-100 px-2 py-0.5 font-semibold text-sky-800">handover</span>}
                {r.urgency !== "normal" && <span className="rounded-full bg-rose-100 px-2 py-0.5 font-semibold text-rose-800">{r.urgency}</span>}
                {r.feedback && <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">{r.feedback}</span>}
                <span>{new Date(r.created_at).toLocaleString()}</span>
              </p>
              {r.response_preview && <p className="mt-1 text-xs italic text-slate-500">reply: {r.response_preview}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                {(["correct", "needs_improvement", "unsafe"] as const).map((fb) => (
                  <button key={fb} onClick={() => review(r.id, fb)} disabled={busy === r.id || r.feedback === fb}
                    className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-40">
                    {fb === "needs_improvement" ? "Needs improvement" : fb[0].toUpperCase() + fb.slice(1)}
                  </button>
                ))}
                <button onClick={() => suggestKnowledge(r)} disabled={busy === r.id || !r.customer_message}
                  className="rounded-full border border-[#0f3f78]/40 bg-[#0f3f78]/5 px-3 py-1 text-xs font-semibold text-[#0f3f78] disabled:opacity-40">
                  Add suggested knowledge
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
