"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  loadUniversities,
  createUniversity,
  updateUniversity,
  type University,
  type PickupPoint,
} from "@/app/admin/(sub)/business-configuration/businessConfigClient";
import { authFetch } from "@/lib/auth";

function emptyDraft() {
  return { name: "", shortCode: "", town: "" };
}

export default function UniversitiesPage() {
  const [universities, setUniversities] = useState<University[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft());
  const [newPickupLabel, setNewPickupLabel] = useState<Record<string, string>>({});
  const [isUniversityAdmin, setIsUniversityAdmin] = useState(false);

  const refresh = async () => {
    try {
      const data = await loadUniversities();
      setUniversities(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        const [data, profileResponse] = await Promise.all([loadUniversities(), authFetch("/api/profile")]);
        setUniversities(data);
        const profileBody = (await profileResponse.json()) as { profile?: { role?: string } };
        setIsUniversityAdmin(profileBody.profile?.role === "university_admin");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };

    void init();
  }, []);

  const flash = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(null), 3000);
  };

  const addUniversity = async () => {
    if (!draft.name.trim() || !draft.shortCode.trim() || !draft.town.trim()) {
      setError("Name, short code and town are all required.");
      return;
    }
    setSaving("new");
    setError(null);
    try {
      await createUniversity({ name: draft.name.trim(), shortCode: draft.shortCode.trim(), town: draft.town.trim(), status: "inactive" });
      setDraft(emptyDraft());
      await refresh();
      flash("University added — its routes stay hidden from customers until you activate it.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  };

  const toggleUniversityStatus = async (university: University) => {
    setSaving(university.id);
    setError(null);
    try {
      const nextStatus = university.status === "active" ? "inactive" : "active";
      await updateUniversity({ id: university.id, status: nextStatus });
      await refresh();
      flash(nextStatus === "active" ? `${university.name} is now visible to customers.` : `${university.name} is now hidden from customers.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  };

  const togglePickupPointStatus = async (university: University, point: PickupPoint) => {
    setSaving(point.id);
    setError(null);
    try {
      const nextStatus = point.status === "active" ? "inactive" : "active";
      await updateUniversity({ id: university.id, pickupPoints: [{ id: point.id, status: nextStatus }] });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  };

  const addPickupPoint = async (university: University) => {
    const label = (newPickupLabel[university.id] || "").trim();
    if (!label) return;
    setSaving(`${university.id}-new-point`);
    setError(null);
    try {
      await updateUniversity({ id: university.id, pickupPoints: [{ label, status: "active" }] });
      setNewPickupLabel((current) => ({ ...current, [university.id]: "" }));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#0f3f78]">Universities</p>
              <h1 className="text-3xl font-black text-slate-900">Manage campuses and pickup points</h1>
              <p className="mt-2 text-sm text-slate-500">
                A university (and each of its pickup points) only shows up in customer search once activated — routes attached to it
                are configured separately under Routes &amp; Fares.
              </p>
            </div>
            <Link
              href={isUniversityAdmin ? "/admin/business-configuration/routes-and-fares" : "/admin/business-configuration"}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Back to Business Configuration
            </Link>
          </div>
        </div>

        {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{message}</div>}
        {error && <div className="rounded-2xl border border-danger/20 bg-danger/10 p-4 text-sm text-danger">{error}</div>}

        {!isUniversityAdmin && <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold text-slate-900">Add a university</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="block text-sm text-slate-700">
              <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-slate-500">Name</span>
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Some University (CODE)"
                className="input-field w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm text-slate-700">
              <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-slate-500">Short code</span>
              <input
                value={draft.shortCode}
                onChange={(e) => setDraft({ ...draft, shortCode: e.target.value.toUpperCase() })}
                placeholder="e.g. CODE"
                className="input-field w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm text-slate-700">
              <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-slate-500">Town</span>
              <input
                value={draft.town}
                onChange={(e) => setDraft({ ...draft, town: e.target.value })}
                placeholder="e.g. Zomba"
                className="input-field w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </label>
          </div>
          <button
            onClick={addUniversity}
            disabled={saving === "new"}
            className="mt-4 rounded-lg bg-[#0f3f78] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0a2d56] disabled:opacity-60"
          >
            {saving === "new" ? "Adding…" : "Add university"}
          </button>
        </div>}

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold text-slate-900">Campuses</h2>
          {loading ? (
            <p className="text-sm text-slate-500">Loading universities…</p>
          ) : (
            <div className="space-y-4">
              {universities.map((university) => (
                <div key={university.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-base font-bold text-slate-900">{university.name}</p>
                      <p className="text-sm text-slate-500">{university.short_code} · {university.town}</p>
                    </div>
                    {!isUniversityAdmin && <button
                      onClick={() => toggleUniversityStatus(university)}
                      disabled={saving === university.id}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-60 ${
                        university.status === "active"
                          ? "border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                          : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {university.status === "active" ? "Active — visible to customers" : "Inactive — hidden"}
                    </button>}
                  </div>

                  <div className="mt-4 border-t border-slate-200 pt-4">
                    <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Pickup points</p>
                    <div className="space-y-2">
                      {(university.pickupPoints || []).map((point) => (
                        <div key={point.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
                          <span className="text-sm font-medium text-slate-800">{point.label}</span>
                          <button
                            onClick={() => togglePickupPointStatus(university, point)}
                            disabled={saving === point.id}
                            className={`rounded-full px-3 py-1 text-xs font-semibold transition disabled:opacity-60 ${
                              point.status === "active"
                                ? "border border-emerald-300 bg-emerald-50 text-emerald-800"
                                : "border border-slate-300 bg-slate-50 text-slate-600"
                            }`}
                          >
                            {point.status === "active" ? "Active" : "Inactive"}
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <input
                        value={newPickupLabel[university.id] || ""}
                        onChange={(e) => setNewPickupLabel((current) => ({ ...current, [university.id]: e.target.value }))}
                        placeholder="e.g. Bunda Campus"
                        className="input-field flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      />
                      <button
                        onClick={() => addPickupPoint(university)}
                        disabled={saving === `${university.id}-new-point`}
                        className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
                      >
                        Add pickup point
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
