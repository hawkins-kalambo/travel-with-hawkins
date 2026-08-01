"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Send,
  MessageCircle,
  Bell,
  Megaphone,
  Search,
  Inbox as InboxIcon,
  CheckCheck,
  Loader2,
  ChevronLeft,
} from "lucide-react";
import { getCurrentUser, authFetch } from "@/lib/auth";
import type { CustomerProfile } from "@/lib/customerAuth";
import CustomerShell from "@/app/customer/_components/CustomerShell";

type ConversationItem = {
  conversation_id: string;
  last_read_at?: string | null;
  communication_conversations?: {
    id: string;
    title?: string | null;
    conversation_type?: string | null;
    updated_at?: string | null;
  } | null;
};

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  priority?: string;
  created_at?: string;
  read_at?: string | null;
};

type AnnouncementItem = {
  id: string;
  title: string;
  body: string;
  pinned?: boolean;
  published_at?: string | null;
};

type ThreadMessage = {
  id: string;
  sender_id: string | null;
  sender_name: string;
  sender_role?: string | null;
  body: string | null;
  created_at?: string;
};

function isUnread(conversation: ConversationItem) {
  const updatedAt = conversation.communication_conversations?.updated_at;
  if (!updatedAt) return false;
  if (!conversation.last_read_at) return true;
  return new Date(updatedAt).getTime() > new Date(conversation.last_read_at).getTime();
}

function timeAgo(iso?: string) {
  if (!iso) return "";
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

export default function CustomerMessagesPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [tab, setTab] = useState<"messages" | "notifications">("messages");
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [search, setSearch] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<ThreadMessage[]>([]);
  const [threadTitle, setThreadTitle] = useState("");
  const [threadLoading, setThreadLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const unreadCount = notifications.filter((item) => !item.read_at).length;

  const loadCommunications = async () => {
    const res = await authFetch("/api/communications");
    if (!res.ok) return;
    const data = await res.json();
    if (!data.success) return;
    const rawConversations: ConversationItem[] = Array.isArray(data.conversations) ? data.conversations : [];
    const dedupedConversations = Array.from(new Map(rawConversations.map((c) => [c.conversation_id, c])).values());
    setConversations(dedupedConversations);
    setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
    setAnnouncements(Array.isArray(data.announcements) ? data.announcements : []);
  };

  useEffect(() => {
    const init = async () => {
      try {
        const currentUser = await getCurrentUser();
        if (!currentUser) {
          router.push("/customer/login");
          return;
        }
        setUserId(currentUser.id);

        const profileRes = await fetch("/api/customers/profile");
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          if (profileData.success && profileData.profile) setProfile(profileData.profile);
        }

        await loadCommunications();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load messages");
      } finally {
        setLoading(false);
      }
    };

    void init();
  }, [router]);

  const openConversation = async (conversationId: string) => {
    setSelectedId(conversationId);
    setThreadLoading(true);
    try {
      const res = await authFetch(`/api/communication/conversations/${conversationId}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setThreadMessages(Array.isArray(data.messages) ? data.messages : []);
        setThreadTitle(data.conversation?.title || "Conversation");
        setConversations((current) =>
          current.map((c) => (c.conversation_id === conversationId ? { ...c, last_read_at: new Date().toISOString() } : c))
        );
      }
    } catch {
      setError("Unable to load conversation");
    } finally {
      setThreadLoading(false);
    }
  };

  const sendReply = async () => {
    if (!selectedId || !draft.trim()) return;
    setSending(true);
    try {
      const res = await authFetch(`/api/communication/conversations/${selectedId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: draft.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setDraft("");
        await openConversation(selectedId);
        await loadCommunications();
      } else {
        setError(data?.error || "Unable to send message");
      }
    } catch {
      setError("Unable to send message");
    } finally {
      setSending(false);
    }
  };

  const markNotificationRead = async (id: string) => {
    setNotifications((current) => current.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
    try {
      await authFetch("/api/communication/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "read" }),
      });
    } catch {
      // non-fatal
    }
  };

  const markAllNotificationsRead = async () => {
    setNotifications((current) => current.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
    try {
      await authFetch("/api/communication/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
      });
    } catch {
      // non-fatal
    }
  };

  const filteredConversations = useMemo(() => {
    const term = search.trim().toLowerCase();
    const sorted = [...conversations].sort((a, b) => {
      const aTime = a.communication_conversations?.updated_at || "";
      const bTime = b.communication_conversations?.updated_at || "";
      return bTime.localeCompare(aTime);
    });
    if (!term) return sorted;
    return sorted.filter((c) => (c.communication_conversations?.title || "").toLowerCase().includes(term));
  }, [conversations, search]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f3f7fb]">
        <div className="text-center">
          <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-[#0A4D8C] mx-auto"></div>
          <p className="text-slate-600">Loading your inbox...</p>
        </div>
      </div>
    );
  }

  return (
    <CustomerShell active="messages" profile={profile} unreadCount={unreadCount} title="Messages" subtitle="Conversations and updates from our team">
      {error ? <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <div className="mb-6 flex gap-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm w-fit">
        <button
          onClick={() => setTab("messages")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
            tab === "messages" ? "bg-[#0A4D8C] text-white" : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          <MessageCircle size={16} />
          Conversations
        </button>
        <button
          onClick={() => setTab("notifications")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
            tab === "notifications" ? "bg-[#0A4D8C] text-white" : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          <Bell size={16} />
          Notifications
          {unreadCount > 0 ? (
            <span className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[11px] font-bold ${tab === "notifications" ? "bg-white text-[#0A4D8C]" : "bg-[#F7931E] text-white"}`}>
              {unreadCount}
            </span>
          ) : null}
        </button>
      </div>

      {tab === "messages" ? (
        <div className="grid gap-5 overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm lg:grid-cols-[340px_1fr]">
          {/* Conversation list */}
          <div className={`border-slate-200 lg:border-r ${selectedId ? "hidden lg:block" : "block"}`}>
            <div className="border-b border-slate-200 p-4">
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search conversations"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-[#0A4D8C]/40"
                />
              </div>
            </div>

            <div className="max-h-[65vh] overflow-y-auto">
              {filteredConversations.length === 0 ? (
                <div className="p-8 text-center">
                  <InboxIcon className="mx-auto mb-3 h-9 w-9 text-slate-300" strokeWidth={1.5} />
                  <p className="text-sm text-slate-500">No conversations yet.</p>
                  <p className="mt-1 text-xs text-slate-400">Messages from our team will appear here.</p>
                </div>
              ) : (
                filteredConversations.map((conversation) => {
                  const unread = isUnread(conversation);
                  const active = selectedId === conversation.conversation_id;
                  return (
                    <button
                      key={conversation.conversation_id}
                      onClick={() => void openConversation(conversation.conversation_id)}
                      className={`flex w-full items-start gap-3 border-b border-slate-100 px-4 py-4 text-left transition last:border-b-0 ${
                        active ? "bg-[#f6fbff]" : "hover:bg-slate-50"
                      }`}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#0A4D8C] to-[#0d5aa3] text-sm font-bold text-white">
                        {(conversation.communication_conversations?.title || "TWH").slice(0, 2).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className={`truncate text-sm ${unread ? "font-bold text-slate-900" : "font-semibold text-slate-700"}`}>
                            {conversation.communication_conversations?.title || "Conversation"}
                          </span>
                          <span className="shrink-0 text-[11px] text-slate-400">{timeAgo(conversation.communication_conversations?.updated_at || undefined)}</span>
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {conversation.communication_conversations?.conversation_type === "direct" ? "Direct message" : "Support conversation"}
                        </span>
                      </span>
                      {unread ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#F7931E]" /> : null}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Thread view */}
          <div className={`flex min-h-[65vh] flex-col ${selectedId ? "block" : "hidden lg:flex"}`}>
            {!selectedId ? (
              <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
                <MessageCircle className="mb-3 h-10 w-10 text-slate-300" strokeWidth={1.5} />
                <p className="text-sm font-semibold text-slate-600">Select a conversation</p>
                <p className="mt-1 text-xs text-slate-400">Choose a conversation from the list to read and reply.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
                  <button onClick={() => setSelectedId(null)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden">
                    <ChevronLeft size={18} />
                  </button>
                  <p className="font-bold text-slate-900">{threadTitle}</p>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto p-5">
                  {threadLoading ? (
                    <div className="flex justify-center py-10">
                      <Loader2 className="h-6 w-6 animate-spin text-[#0A4D8C]" />
                    </div>
                  ) : threadMessages.length === 0 ? (
                    <p className="text-center text-sm text-slate-400">No messages yet.</p>
                  ) : (
                    threadMessages.map((msg) => {
                      const isMine = msg.sender_id === userId;
                      return (
                        <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm ${isMine ? "bg-[#0A4D8C] text-white" : "border border-slate-200 bg-slate-50 text-slate-800"}`}>
                            {!isMine ? <p className="mb-1 text-xs font-bold text-[#0A4D8C]">{msg.sender_name}</p> : null}
                            <p className="whitespace-pre-wrap">{msg.body}</p>
                            <p className={`mt-1.5 text-[11px] ${isMine ? "text-white/60" : "text-slate-400"}`}>{timeAgo(msg.created_at)}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="border-t border-slate-200 p-4">
                  <div className="flex items-end gap-3">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void sendReply();
                        }
                      }}
                      rows={1}
                      placeholder="Write a reply..."
                      className="flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-[#0A4D8C]/40"
                    />
                    <button
                      onClick={() => void sendReply()}
                      disabled={sending || !draft.trim()}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#0A4D8C] text-white transition hover:bg-[#083a6b] disabled:opacity-50"
                      aria-label="Send message"
                    >
                      {sending ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-end">
            <button
              onClick={() => void markAllNotificationsRead()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <CheckCheck size={14} /> Mark all as read
            </button>
          </div>

          {announcements.length > 0 ? (
            <div className="space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.15em] text-slate-500">
                <Megaphone size={14} /> Announcements
              </h3>
              {announcements.map((item) => (
                <div key={item.id} className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold text-slate-900">{item.title}</p>
                    {item.pinned ? <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-800">PINNED</span> : null}
                  </div>
                  <p className="mt-1.5 text-sm text-slate-700">{item.body}</p>
                </div>
              ))}
            </div>
          ) : null}

          <div className="space-y-3">
            {notifications.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
                <Bell className="mx-auto mb-3 h-9 w-9 text-slate-300" strokeWidth={1.5} />
                <p className="text-sm text-slate-500">You&apos;re all caught up. No notifications yet.</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <button
                  key={notification.id}
                  onClick={() => !notification.read_at && void markNotificationRead(notification.id)}
                  className={`flex w-full items-start justify-between gap-4 rounded-2xl border p-4 text-left transition ${
                    notification.read_at ? "border-slate-200 bg-white" : "border-[#0A4D8C]/20 bg-[#f6fbff] hover:bg-[#eef7ff]"
                  }`}
                >
                  <div>
                    <p className="font-semibold text-slate-900">{notification.title}</p>
                    <p className="mt-1 text-sm text-slate-600">{notification.message}</p>
                    <p className="mt-2 text-xs text-slate-400">{timeAgo(notification.created_at)}</p>
                  </div>
                  {!notification.read_at ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#F7931E]" /> : null}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </CustomerShell>
  );
}
