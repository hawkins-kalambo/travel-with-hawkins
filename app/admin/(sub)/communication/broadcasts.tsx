"use client";

import { useCallback, useEffect, useState } from "react";
import { authFetch } from "@/lib/auth";
import { LoadingState } from "@/app/components/ui/Spinner";
import Badge from "@/app/components/ui/Badge";

type Announcement = {
  id: string;
  title: string;
  body: string;
  audience: string;
  pinned: boolean;
  published_at?: string;
};

type BroadcastTemplate = {
  label: string;
  title: string;
  body: string;
  audience: string;
  pinned: boolean;
};

const broadcastTemplates: BroadcastTemplate[] = [
  {
    label: "Trip reminder",
    title: "Reminder: upcoming trip departures",
    body: "Please remind passengers to arrive 30 minutes before departure and bring their booking reference.",
    audience: "everyone",
    pinned: true,
  },
  {
    label: "Referral push",
    title: "Share our referral offer with your network",
    body: "Ambassadors can now invite new customers to book and earn rewards on qualified referrals.",
    audience: "ambassadors",
    pinned: false,
  },
  {
    label: "Support notice",
    title: "Support response window update",
    body: "Our support team is prioritizing urgent tickets and will continue to respond during the business day.",
    audience: "admins",
    pinned: false,
  },
];

export default function BroadcastCenterSection() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState("everyone");
  const [pinned, setPinned] = useState(true);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await authFetch("/api/announcements");
      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Unable to load broadcasts");
      }
      setAnnouncements(Array.isArray(data.announcements) ? data.announcements : []);
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Unable to load broadcasts" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const applyTemplate = (template: BroadcastTemplate) => {
    setTitle(template.title);
    setBody(template.body);
    setAudience(template.audience);
    setPinned(template.pinned);
    setMessage({ type: "info", text: `Loaded ${template.label} template` });
  };

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) {
      setMessage({ type: "error", text: "Title and message are required" });
      return;
    }

    setSending(true);
    setMessage(null);
    try {
      const response = await authFetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, audience, pinned }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Unable to publish broadcast");
      }

      setTitle("");
      setBody("");
      setAudience("everyone");
      setPinned(true);
      setMessage({ type: "success", text: "Broadcast published successfully" });
      await load();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Unable to publish broadcast" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Broadcast center</h3>
            <p className="mt-1 text-sm text-gray-600">Compose operational updates for ambassadors, admins, or everyone.</p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">Templates</h4>
            <div className="mt-3 space-y-2">
              {broadcastTemplates.map((template) => (
                <button
                  key={template.label}
                  onClick={() => applyTemplate(template)}
                  className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2 text-left text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  <span>{template.label}</span>
                  <span className="text-xs uppercase tracking-[0.2em] text-gray-500">Use</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Broadcast title"
              className="input-field"
            />

            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Write the message you want to broadcast"
              rows={5}
              className="input-field"
            />

            <div className="grid gap-3 md:grid-cols-2">
              <select value={audience} onChange={(event) => setAudience(event.target.value)} className="input-field">
                <option value="everyone">Everyone</option>
                <option value="admins">Admins only</option>
                <option value="ambassadors">Ambassadors only</option>
              </select>

              <label className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700">
                <input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} />
                Pin this broadcast
              </label>
            </div>

            {message ? (
              <div
                className={`rounded-lg p-3 text-sm ${
                  message.type === "success" ? "bg-success/10 text-success" : message.type === "error" ? "bg-danger/10 text-danger" : "bg-gray-100 text-gray-700"
                }`}
              >
                {message.text}
              </div>
            ) : null}

            <button
              onClick={() => void handleSend()}
              disabled={sending || !title.trim() || !body.trim()}
              className="btn-primary disabled:opacity-60"
            >
              {sending ? "Publishing..." : "Publish broadcast"}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800">Recent broadcasts</h3>
          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-gray-600">
            {announcements.length}
          </span>
        </div>

        {loading ? (
          <LoadingState label="Loading recent broadcasts…" />
        ) : announcements.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
            No broadcasts yet. Create one to keep the team aligned.
          </div>
        ) : (
          <ul className="space-y-3">
            {announcements.slice(0, 6).map((announcement) => (
              <li key={announcement.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-800">{announcement.title}</p>
                    <p className="mt-1 text-sm text-gray-600">{announcement.body}</p>
                  </div>
                  <div className="text-right text-xs text-gray-500">
                    <div className="font-semibold uppercase tracking-[0.2em]">{announcement.audience}</div>
                    {announcement.pinned ? (
                      <div className="mt-1">
                        <Badge tone="warning">Pinned</Badge>
                      </div>
                    ) : null}
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
