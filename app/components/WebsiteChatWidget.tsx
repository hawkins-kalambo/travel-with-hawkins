"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Loader2, RotateCcw } from "lucide-react";
import type { AgentPresence } from "@/lib/websiteChat/types";

const POLL_INTERVAL_MS = 8000;

type ChatMessage = {
  id: string;
  senderKind: "guest" | "bot" | "admin";
  senderName: string;
  body: string;
  createdAt: string;
};

type ChatConversation = {
  conversationId: string;
  mode: "bot" | "human";
  status: "bot_controlled" | "waiting" | "human_controlled" | "resolved";
};

type KnownContact = { name: string; phone?: string; email?: string };

function formatLastSeen(iso: string): string {
  const diffMinutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMinutes < 1) return "moments ago";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return new Date(iso).toLocaleDateString();
}

// Mounted both anonymously on the public homepage and, with `knownContact`
// supplied, inside CustomerShell for logged-in customers — in that case it
// skips the "tell us about you" form entirely and starts the chat with
// their real profile info (the backend also links it to their
// customer_profiles row, see app/api/website-chat/start/route.ts).
export default function WebsiteChatWidget({ knownContact }: { knownContact?: KnownContact } = {}) {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const [conversation, setConversation] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [agentPresence, setAgentPresence] = useState<AgentPresence | null>(null);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  // Set only while a guest's "tell us about you" form is showing because
  // they chose "New conversation" -- makes the next handleStart submission
  // send forceNew so the backend resolves the old conversation instead of
  // just resuming it again.
  const [pendingNewConversation, setPendingNewConversation] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || checked) return;
    (async () => {
      try {
        const res = await fetch("/api/website-chat/messages");
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setConversation(data.conversation);
            setMessages(data.messages);
            setAgentPresence(data.agentPresence ?? null);
          }
        }
      } catch {
        // No existing session — the contact form will show instead.
      } finally {
        setChecked(true);
      }
    })();
  }, [open, checked]);

  useEffect(() => {
    if (!open || !conversation) return;
    const timer = window.setInterval(async () => {
      try {
        const res = await fetch("/api/website-chat/messages");
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setConversation(data.conversation);
            setMessages(data.messages);
            setAgentPresence(data.agentPresence ?? null);
          }
        }
      } catch {
        // silent — next poll retries
      }
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [open, conversation]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const startChat = async (payload: { name?: string; phone?: string; email?: string }, forceNew = false) => {
    setStarting(true);
    setStartError("");
    try {
      const res = await fetch("/api/website-chat/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, forceNew }),
      });
      const data = await res.json();
      if (!data.success) {
        setStartError(data.error || "Unable to start chat");
        return;
      }
      setConversation(data.conversation);
      setMessages(data.messages);
      setAgentPresence(null);
      setPendingNewConversation(false);
    } catch {
      setStartError("Unable to start chat. Please try again.");
    } finally {
      setStarting(false);
    }
  };

  // A known (logged-in) customer starts fresh immediately, since we already
  // have their contact info. A guest doesn't have anywhere near-instant to
  // resend -- getConversationByToken only ever returns their name, not
  // phone/email -- so they see the "tell us about you" form again; the
  // backend falls back to their previous contact details for anything left
  // blank (see app/api/website-chat/start/route.ts).
  const handleStartNewConversation = () => {
    if (starting) return;
    if (knownContact) {
      void startChat(knownContact, true);
      return;
    }
    setConversation(null);
    setMessages([]);
    setName("");
    setContact("");
    setPendingNewConversation(true);
  };

  // A logged-in customer skips the manual form entirely — we already know
  // who they are, so start the chat as soon as we've confirmed there's no
  // existing session to resume.
  useEffect(() => {
    if (!open || !checked || conversation || starting || !knownContact) return;
    const timer = window.setTimeout(() => {
      void startChat({ name: knownContact.name, phone: knownContact.phone, email: knownContact.email });
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, checked, conversation, knownContact]);

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !contact.trim()) return;
    const isEmail = contact.includes("@");
    await startChat(
      {
        name: name.trim(),
        phone: isEmail ? undefined : contact.trim(),
        email: isEmail ? contact.trim() : undefined,
      },
      pendingNewConversation
    );
  };

  const handleSend = async () => {
    if (!draft.trim() || !conversation) return;
    const text = draft.trim();
    setDraft("");
    setSending(true);
    try {
      const res = await fetch("/api/website-chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const data = await res.json();
      if (data.success) {
        setConversation(data.conversation);
        setMessages((current) => [...current, ...data.messages]);
      }
    } catch {
      // The next poll will resync if this silently failed.
    } finally {
      setSending(false);
    }
  };

  const presence = conversation?.mode === "human" ? agentPresence : null;

  const statusLabel =
    conversation?.status === "waiting"
      ? "Connecting you with a team member…"
      : conversation?.status === "human_controlled"
        ? presence?.name
          ? `Chatting with ${presence.name}`
          : "Chatting with a Travel with Hawkins team member"
        : conversation?.status === "resolved"
          ? "This conversation has been resolved"
          : "Travel with Hawkins assistant";

  const presenceNode = presence?.typing ? (
    <>
      <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-white/70" />
      {presence.name ? `${presence.name} is typing…` : "Agent is typing…"}
    </>
  ) : presence?.online ? (
    <>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-400" />
      Active
    </>
  ) : presence?.lastSeenAt ? (
    <>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-white/40" />
      Last seen {formatLastSeen(presence.lastSeenAt)}
    </>
  ) : null;

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close chat" : "Chat with Travel with Hawkins"}
        className="fixed bottom-5 left-4 z-40 grid h-14 w-14 place-items-center rounded-full border-2 border-white bg-[#0A4D8C] shadow-lg shadow-slate-950/25 transition duration-200 hover:-translate-y-1 hover:bg-[#083a6b] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange focus-visible:ring-offset-2 sm:bottom-6 sm:left-6 sm:h-12 sm:w-12"
      >
        {open ? <X className="h-7 w-7 text-white sm:h-6 sm:w-6" /> : <MessageCircle className="h-7 w-7 text-white sm:h-6 sm:w-6" />}
      </button>

      {open && (
        <div className="fixed bottom-24 left-4 z-40 flex h-[70vh] max-h-[560px] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-2xl sm:bottom-28 sm:left-6">
          <div className="flex items-center justify-between gap-3 bg-[#0A4D8C] px-5 py-4 text-white">
            <div>
              <p className="font-black">Travel with Hawkins</p>
              <p className="text-xs text-white/75">{statusLabel}</p>
              {presenceNode && <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-white/70">{presenceNode}</p>}
            </div>
            {conversation && (
              <button
                onClick={handleStartNewConversation}
                disabled={starting}
                title="Start a new conversation"
                className="flex shrink-0 items-center gap-1 rounded-full border border-white/30 px-2.5 py-1.5 text-[11px] font-semibold text-white/90 transition hover:bg-white/10 disabled:opacity-50"
              >
                <RotateCcw className="h-3 w-3" />
                New chat
              </button>
            )}
          </div>

          {!conversation ? (
            <div className="flex flex-1 flex-col justify-center p-5">
              {!checked || (knownContact && starting) ? (
                <div className="flex justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-[#0A4D8C]" />
                </div>
              ) : knownContact ? (
                <div className="space-y-3 text-center">
                  <p className="text-sm text-red-600">{startError || "Unable to start chat."}</p>
                  <button
                    onClick={() => void startChat(knownContact)}
                    className="rounded-2xl bg-[#0A4D8C] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#083a6b]"
                  >
                    Try again
                  </button>
                </div>
              ) : (
                <form onSubmit={handleStart} className="space-y-3">
                  <p className="text-sm text-slate-600">Tell us a bit about you so we can chat and follow up if needed.</p>
                  {startError && <p className="text-sm text-red-600">{startError}</p>}
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    required
                    className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-[#0A4D8C] focus:ring-4 focus:ring-[#0A4D8C]/10"
                  />
                  <input
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    placeholder="Phone or email"
                    required
                    className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-[#0A4D8C] focus:ring-4 focus:ring-[#0A4D8C]/10"
                  />
                  <button
                    type="submit"
                    disabled={starting}
                    className="w-full rounded-2xl bg-[#0A4D8C] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#083a6b] disabled:opacity-60"
                  >
                    {starting ? "Starting…" : "Start chat"}
                  </button>
                </form>
              )}
            </div>
          ) : (
            <>
              <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
                {messages.map((message) => {
                  const isGuest = message.senderKind === "guest";
                  return (
                    <div key={message.id} className={`flex ${isGuest ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${isGuest ? "bg-[#0A4D8C] text-white" : "border border-slate-200 bg-slate-50 text-slate-800"}`}>
                        {!isGuest && <p className="mb-0.5 text-[11px] font-bold text-[#0A4D8C]">{message.senderKind === "admin" ? message.senderName : "Assistant"}</p>}
                        <p className="whitespace-pre-wrap">{message.body}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="border-t border-slate-200 p-3">
                <div className="flex items-end gap-2">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void handleSend();
                      }
                    }}
                    rows={1}
                    placeholder="Type a message…"
                    className="flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-[#0A4D8C]/40"
                  />
                  <button
                    onClick={() => void handleSend()}
                    disabled={sending || !draft.trim()}
                    aria-label="Send message"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#0A4D8C] text-white transition hover:bg-[#083a6b] disabled:opacity-50"
                  >
                    {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
