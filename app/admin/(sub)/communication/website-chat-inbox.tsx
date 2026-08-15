"use client";

import { useCallback, useEffect, useState } from "react";
import { authFetch } from "@/lib/auth";

type Contact = { name?: string; phone?: string | null; email?: string | null };
type Conversation = { conversation_id: string; mode: string; status: string; last_message_at: string; contact?: Contact | Contact[] | null };
type Message = { id: string; senderKind: "guest" | "bot" | "admin"; senderName: string; body: string; createdAt: string };
type Detail = { conversation: { conversationId: string; mode: string; status: string; assignedTo?: string | null }; contact: { phone?: string | null; email?: string | null } | null; messages: Message[]; agents: Array<{ id: string; full_name?: string; email?: string }> };

function contactOf(conversation: Conversation): Contact {
  return (Array.isArray(conversation.contact) ? conversation.contact[0] : conversation.contact) || {};
}

export default function WebsiteChatInboxSection() {
  const [items, setItems] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      if (status) params.set("status", status);
      const response = await authFetch(`/api/admin/website-chat/conversations?${params}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to load website chat inbox");
      setItems(body.conversations || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load inbox");
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  const loadDetail = useCallback(async (id: string) => {
    setSelected(id);
    setError(null);
    const response = await authFetch(`/api/admin/website-chat/conversations/${id}`);
    const body = await response.json();
    if (!response.ok) {
      setError(body.error || "Unable to load transcript");
      return;
    }
    setDetail(body);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadList(), 200);
    return () => window.clearTimeout(timer);
  }, [loadList]);

  useEffect(() => {
    if (!selected) return;
    const timer = window.setInterval(() => void loadDetail(selected), 15000);
    return () => window.clearInterval(timer);
  }, [selected, loadDetail]);

  async function action(actionName: "takeover" | "resolve" | "bot") {
    if (!selected) return;
    const response = await authFetch(`/api/admin/website-chat/conversations/${selected}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: actionName }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error || "Unable to update conversation");
      return;
    }
    await Promise.all([loadDetail(selected), loadList()]);
  }

  async function assign(assigneeId: string) {
    if (!selected || !assigneeId) return;
    const response = await authFetch(`/api/admin/website-chat/conversations/${selected}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "assign", assigneeId }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error || "Unable to assign conversation");
      return;
    }
    await Promise.all([loadDetail(selected), loadList()]);
  }

  async function submitReply() {
    if (!selected || !reply.trim()) return;
    const response = await authFetch(`/api/admin/website-chat/conversations/${selected}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: reply }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error || "Unable to send reply");
      return;
    }
    setReply("");
    await loadDetail(selected);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 md:flex-row">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, phone, or email" className="input-field flex-1" />
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="input-field md:w-56">
          <option value="">All conversations</option>
          <option value="bot_controlled">Bot controlled</option>
          <option value="waiting">Waiting</option>
          <option value="human_controlled">Human controlled</option>
          <option value="resolved">Resolved</option>
        </select>
        <button onClick={() => void loadList()} className="rounded-xl bg-primary-700 px-4 py-2 font-semibold text-white">
          Refresh
        </button>
      </div>
      {error ? <div className="rounded-xl border border-danger/20 bg-danger/10 p-3 text-sm text-danger">{error}</div> : null}
      <div className="grid min-h-[620px] gap-4 lg:grid-cols-[340px_1fr]">
        <aside className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <div className="border-b border-gray-200 p-3 text-sm font-semibold text-gray-600">{loading ? "Loading…" : `${items.length} conversations`}</div>
          <div className="max-h-[570px] overflow-y-auto">
            {items.map((item) => {
              const contact = contactOf(item);
              return (
                <button
                  key={item.conversation_id}
                  onClick={() => void loadDetail(item.conversation_id)}
                  className={`block w-full border-b border-gray-100 p-4 text-left hover:bg-gray-50 ${selected === item.conversation_id ? "bg-primary-50" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-gray-900">{contact.name || "Website visitor"}</span>
                    <span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] uppercase">{item.status.replaceAll("_", " ")}</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{contact.phone || contact.email || ""}</p>
                  <p className="mt-1 text-xs text-gray-400">{new Date(item.last_message_at).toLocaleString()}</p>
                </button>
              );
            })}
          </div>
        </aside>
        <section className="rounded-2xl border border-gray-200 bg-white">
          {!detail ? (
            <div className="grid h-full place-items-center p-8 text-gray-500">Select a website chat conversation.</div>
          ) : (
            <div className="flex h-full flex-col">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-4">
                <div>
                  <p className="font-semibold text-gray-900">{detail.conversation.status.replaceAll("_", " ")}</p>
                  <p className="text-xs text-gray-500">
                    Mode: {detail.conversation.mode} {detail.contact?.phone ? `• ${detail.contact.phone}` : ""} {detail.contact?.email ? `• ${detail.contact.email}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <select value={detail.conversation.assignedTo || ""} onChange={(event) => void assign(event.target.value)} className="rounded-lg border px-2 py-2 text-xs">
                    <option value="">Assign agent</option>
                    {detail.agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.full_name || agent.email || agent.id}
                      </option>
                    ))}
                  </select>
                  <button onClick={() => void action("takeover")} className="rounded-lg bg-primary-700 px-3 py-2 text-xs font-semibold text-white">
                    Take over
                  </button>
                  <button onClick={() => void action("resolve")} className="rounded-lg border px-3 py-2 text-xs font-semibold">
                    Resolve
                  </button>
                  <button onClick={() => void action("bot")} className="rounded-lg border px-3 py-2 text-xs font-semibold">
                    Return to bot
                  </button>
                </div>
              </div>
              <div className="max-h-[360px] flex-1 space-y-3 overflow-y-auto p-4">
                {detail.messages.map((message) => (
                  <div key={message.id} className={`max-w-[80%] rounded-2xl p-3 text-sm ${message.senderKind === "admin" ? "ml-auto bg-primary-700 text-white" : "bg-gray-100 text-gray-900"}`}>
                    {message.senderKind !== "admin" ? <p className="mb-1 text-[10px] font-semibold uppercase text-gray-500">{message.senderKind === "bot" ? "Assistant" : message.senderName}</p> : null}
                    <p className="whitespace-pre-wrap">{message.body}</p>
                    <p className="mt-1 text-[10px] opacity-70">{new Date(message.createdAt).toLocaleString()}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-3 border-t border-gray-200 p-4">
                <div className="flex gap-2">
                  <textarea value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Reply to visitor (take over first)" className="input-field min-h-20 flex-1" />
                  <button onClick={() => void submitReply()} className="rounded-xl bg-primary-700 px-4 font-semibold text-white">
                    Send
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
