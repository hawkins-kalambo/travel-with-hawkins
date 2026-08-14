"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { authFetch } from "@/lib/auth";

const POLL_INTERVAL_MS = 15000;

type Message = {
  id: string;
  sender_id: string;
  sender_name?: string;
  sender_role?: string | null;
  body: string;
  html?: string | null;
  attachments?: Array<unknown>;
  created_at?: string;
};

export default function ConversationDetailPage() {
  const params = useParams();
  const conversationId = params?.id as string | undefined;
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const loadMessages = useCallback(
    async (silent = false) => {
      if (!conversationId) return;
      if (!silent) setLoading(true);
      if (!silent) setError(null);

      try {
        const response = await authFetch(`/api/communication/conversations/${conversationId}`);
        const body = await response.json();

        if (!response.ok || !body?.success) {
          throw new Error(body?.error || "Unable to load conversation messages");
        }

        setMessages(Array.isArray(body.messages) ? body.messages : []);
      } catch (err) {
        if (!silent) setError(err instanceof Error ? err.message : "Unable to load conversation messages");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [conversationId]
  );

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  // Live-updates the thread while it's open, so an admin/customer reply
  // shows up without a manual refresh — mirrors the polling pattern already
  // proven in app/admin/(sub)/communication/whatsapp-inbox.tsx.
  useEffect(() => {
    if (!conversationId) return;
    const timer = window.setInterval(() => void loadMessages(true), POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [conversationId, loadMessages]);

  const handleSend = async () => {
    if (!conversationId || !draft.trim()) return;
    setSending(true);
    setError(null);

    try {
      const response = await authFetch(`/api/communication/conversations/${conversationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: draft.trim() }),
      });
      const body = await response.json();

      if (!response.ok || !body?.success) {
        throw new Error(body?.error || "Unable to send message");
      }

      setDraft("");
      setMessages((current) => [...current, { ...body.message, sender_name: "You" }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send message");
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#0a4d8c]">Conversation</p>
            <h1 className="text-3xl font-black text-slate-900">Message thread</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/communication" className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Back to hub
            </Link>
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
          {loading ? (
            <div className="text-sm text-slate-600">Loading messages…</div>
          ) : error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
          ) : messages.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              No messages in this conversation yet.
            </div>
          ) : (
            <ul className="space-y-4">
              {messages.map((message) => (
                <li key={message.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm font-semibold text-slate-900">
                      {message.sender_id === "system" ? "System" : message.sender_name || "Travel with Hawkins"}
                    </p>
                    <p className="text-xs text-slate-500">{message.created_at ? new Date(message.created_at).toLocaleString() : "—"}</p>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-slate-700">{message.body}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Send a message</h2>
          <p className="mt-1 text-sm text-slate-600">Respond to this conversation or add a new update for the team.</p>
          <div className="mt-4 space-y-4">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={4}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#0a4d8c] focus:ring-4 focus:ring-[#0a4d8c]/10"
              placeholder="Write your message..."
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || !draft.trim()}
              className="inline-flex items-center justify-center rounded-2xl bg-[#0a4d8c] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#083a6b] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sending ? "Sending…" : "Send message"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
