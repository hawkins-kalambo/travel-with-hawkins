"use client";

import { useCallback, useEffect, useState } from "react";
import { authFetch } from "@/lib/auth";

type Announcement = {
  id: string;
  title: string;
  body: string;
  audience: string;
  pinned: boolean;
  published_at?: string;
  expires_at?: string | null;
};

export default function AnnouncementsSection() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState("everyone");
  const [pinned, setPinned] = useState(false);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/announcements");
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || "Unable to load announcements");
      setAnnouncements(Array.isArray(data.announcements) ? data.announcements : []);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to load announcements");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async () => {
    if (!title.trim() || !body.trim()) {
      setMessage("Title and body are required");
      return;
    }

    setCreating(true);
    setMessage(null);
    try {
      const res = await authFetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, audience, pinned }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to create announcement");

      setTitle("");
      setBody("");
      setAudience("everyone");
      setPinned(false);
      setMessage("Announcement created successfully");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to create announcement");
    } finally {
      setCreating(false);
    }
  };

  const togglePin = async (id: string, currentPinned: boolean) => {
    try {
      const res = await authFetch("/api/announcements", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, pinned: !currentPinned }),
      });
      if (!res.ok) throw new Error("Failed to update announcement");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to update announcement");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this announcement?")) return;
    try {
      const res = await authFetch("/api/announcements", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("Failed to delete announcement");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to delete announcement");
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Create announcement</h3>

        <div className="space-y-4">
          <input
            type="text"
            placeholder="Announcement title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input-field"
          />

          <textarea
            placeholder="Announcement body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            className="input-field"
          />

          <div className="grid grid-cols-2 gap-3">
            <select value={audience} onChange={(e) => setAudience(e.target.value)} className="input-field">
              <option value="everyone">Everyone</option>
              <option value="admins">Admins only</option>
              <option value="ambassadors">Ambassadors only</option>
            </select>

            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 cursor-pointer hover:bg-slate-50">
              <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
              <span className="text-sm font-semibold text-slate-700">Pin announcement</span>
            </label>
          </div>

          {message && (
            <div className={`rounded-lg p-3 text-sm ${message.includes("success") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
              {message}
            </div>
          )}

          <button
            onClick={() => void handleCreate()}
            disabled={creating || !title.trim() || !body.trim()}
            className="btn-primary disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create Announcement"}
          </button>
        </div>
      </div>

      <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Active announcements</h3>

        {loading ? (
          <div className="text-sm text-slate-500">Loading announcements...</div>
        ) : announcements.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            No announcements yet. Create one to get started.
          </div>
        ) : (
          <ul className="space-y-3">
            {announcements.map((ann) => (
              <li key={ann.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-900">{ann.title}</p>
                      {ann.pinned ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
                          Pinned
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{ann.body}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      Audience: <span className="font-semibold">{ann.audience}</span>
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => void togglePin(ann.id, ann.pinned)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      {ann.pinned ? "Unpin" : "Pin"}
                    </button>
                    <button
                      onClick={() => void handleDelete(ann.id)}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
