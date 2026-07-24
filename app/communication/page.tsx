"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/auth";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  priority: string;
  created_at?: string;
  read_at?: string | null;
};

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

type TicketItem = {
  id: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  created_at?: string;
};

type AnnouncementItem = {
  id: string;
  title: string;
  body: string;
  audience: string;
  pinned: boolean;
  published_at?: string;
  expires_at?: string | null;
};

export default function CommunicationPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "notifications" | "announcements" | "tickets">("overview");

  useEffect(() => {
    const loadCommunications = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await authFetch("/api/communications");
        const body = await response.json();

        if (!response.ok || !body?.success) {
          throw new Error(body?.error || "Unable to load communication center");
        }

        setNotifications(Array.isArray(body.notifications) ? body.notifications : []);
        setConversations(Array.isArray(body.conversations) ? body.conversations : []);
        setTickets(Array.isArray(body.tickets) ? body.tickets : []);
        setAnnouncements(Array.isArray(body.announcements) ? body.announcements : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load communication center");
      } finally {
        setLoading(false);
      }
    };

    void loadCommunications();
  }, []);

  const summary = {
    notifications: notifications.length,
    conversations: conversations.length,
    tickets: tickets.length,
    announcements: announcements.length,
  };

  return (
    <main className="space-y-6 p-4 md:p-6">
      <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_-24px_rgba(10,77,140,0.35)] md:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#0a4d8c]">Communication center</p>
            <h1 className="mt-2 text-3xl font-black text-slate-900">Platform communication hub</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              View notifications, announcements, support tickets, and conversation updates in one central workspace.
            </p>
          </div>
          <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
            Shared workspace
          </div>
        </div>
      </div>

      <div className="rounded-[24px] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 flex gap-1 p-1">
          {[
            { key: "overview", label: "Overview" },
            { key: "notifications", label: "Notifications" },
            { key: "announcements", label: "Announcements" },
            { key: "tickets", label: "Tickets" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`px-4 py-2 text-sm font-semibold transition rounded-lg ${
                activeTab === tab.key
                  ? "bg-[#0a4d8c] text-white"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {loading ? (
            <div className="text-sm text-slate-600">Loading communication data…</div>
          ) : error ? (
            <div className="rounded-[24px] border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</div>
          ) : (
            <>
              {activeTab === "overview" && (
                <div className="grid gap-6 xl:grid-cols-2">
                  <section>
                    <div className="mb-4 flex items-center justify-between">
                      <h2 className="text-lg font-semibold text-slate-900">Summary</h2>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate-600">
                        Updated now
                      </span>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {Object.entries(summary).map(([label, value]) => (
                        <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-sm uppercase tracking-[0.24em] text-slate-500">{label}</p>
                          <p className="mt-2 text-3xl font-black text-slate-900">{value}</p>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-slate-900">Latest notification</p>
                      <p className="mt-2 text-sm text-slate-600">
                        {notifications[0]?.message ?? "No notifications yet."}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-slate-900">Latest announcement</p>
                      <p className="mt-2 text-sm text-slate-600">
                        {announcements[0]?.title ?? "No announcements yet."}
                      </p>
                    </div>
                  </section>
                </div>
              )}

              {activeTab === "notifications" && (
                <div className="space-y-3">
                  {notifications.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                      No notifications available.
                    </div>
                  ) : (
                    notifications.map((notification) => (
                      <div key={notification.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-semibold text-slate-900">{notification.title}</p>
                            <p className="mt-1 text-sm text-slate-600">{notification.message}</p>
                          </div>
                          <span className="rounded-full bg-[#0a4d8c] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-white">
                            {notification.priority}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === "announcements" && (
                <div className="space-y-3">
                  {announcements.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                      No announcements available.
                    </div>
                  ) : (
                    announcements.map((announcement) => (
                      <div key={announcement.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <p className="font-semibold text-slate-900">{announcement.title}</p>
                          {announcement.pinned ? (
                            <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700">
                              Pinned
                            </span>
                          ) : null}
                        </div>
                        <p className="text-sm text-slate-600">{announcement.body}</p>
                        <p className="mt-3 text-xs text-slate-500">Audience: {announcement.audience}</p>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === "tickets" && (
                <div className="space-y-3">
                  {tickets.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                      No support tickets available.
                    </div>
                  ) : (
                    tickets.map((ticket) => (
                      <div key={ticket.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-900">{ticket.subject}</p>
                            <p className="mt-1 text-sm text-slate-600">{ticket.category}</p>
                          </div>
                          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-700">
                            {ticket.status}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
