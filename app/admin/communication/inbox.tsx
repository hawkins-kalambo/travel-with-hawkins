"use client";

import { useCallback, useEffect, useState } from "react";
import { authFetch } from "@/lib/auth";

type ConversationItem = {
  conversation_id: string;
  starred?: boolean;
  archived?: boolean;
  last_read_at?: string | null;
  communication_conversations?: {
    id: string;
    title?: string | null;
    conversation_type?: string | null;
    updated_at?: string | null;
  } | null;
};

export default function InboxSection({ conversations, onRefresh }: { conversations: ConversationItem[]; onRefresh: () => Promise<void> }) {
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [localConversations, setLocalConversations] = useState(conversations);

  useEffect(() => {
    setLocalConversations(conversations);
  }, [conversations]);

  const handleCreateConversation = async () => {
    if (!draftTitle.trim() || !draftBody.trim()) {
      setMessage("Title and message are required");
      return;
    }

    setCreating(true);
    setMessage(null);
    try {
      const response = await authFetch("/api/communication/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: draftTitle.trim(), body: draftBody.trim() }),
      });
      const body = await response.json();
      if (!response.ok || !body?.success) {
        throw new Error(body?.error || "Unable to start conversation");
      }

      setDraftTitle("");
      setDraftBody("");
      setMessage("Conversation started successfully");
      await onRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to start conversation");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Start a new conversation</h3>
        <p className="mt-1 text-sm text-slate-600">Kick off an internal message thread for operations, support, or follow-up work.</p>

        <div className="mt-4 space-y-4">
          <input
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            placeholder="Conversation title"
            className="input-field"
          />
          <textarea
            value={draftBody}
            onChange={(event) => setDraftBody(event.target.value)}
            rows={4}
            placeholder="Write the opening message"
            className="input-field"
          />
          <button
            onClick={() => void handleCreateConversation()}
            disabled={creating || !draftTitle.trim() || !draftBody.trim()}
            className="btn-primary disabled:opacity-60"
          >
            {creating ? "Starting..." : "Start conversation"}
          </button>
          {message ? <div className={`rounded-lg p-3 text-sm ${message.includes("success") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{message}</div> : null}
        </div>
      </div>

      <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Recent conversations</h3>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate-600">
            {localConversations.length}
          </span>
        </div>

        {localConversations.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            No conversations yet. Start one to keep communication flowing.
          </div>
        ) : (
          <div className="space-y-3">
            {localConversations.map((conversation) => (
              <div key={conversation.conversation_id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{conversation.communication_conversations?.title || "Conversation"}</p>
                    <p className="mt-1 text-sm text-slate-600">{conversation.communication_conversations?.conversation_type || "System conversation"}</p>
                  </div>
                  <a href={`/communication/conversations/${conversation.conversation_id}`} className="rounded-full bg-[#0a4d8c] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-white hover:bg-[#083a6b]">
                    Open
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
