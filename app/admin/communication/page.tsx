"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/auth";
import AnnouncementsSection from "./announcements";
import SupportTicketsSection from "./support-tickets";

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

export default function AdminCommunicationPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "announcements" | "tickets" | "conversations">("overview");

  useEffect(() => {
    const load = async () => {
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
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load communication center");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  return (
    <main className="space-y-6 p-4 md:p-6">
      <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_-24px_rgba(10,77,140,0.35)] md:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#0a4d8c]">Communication center</p>
            <h1 className="mt-2 text-3xl font-black text-slate-900">Internal communications</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Monitor notifications, announcements, and support requests from one place.
            </p>
          </div>
          <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
            Admin workspace
          </div>
        </div>
      </div>

      <div className="rounded-[24px] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 flex gap-1 p-1">
          {[
            { key: "overview", label: "Overview" },
            { key: "announcements", label: "Announcements" },
            { key: "tickets", label: "Support Tickets" },
            { key: "conversations", label: "Conversations" },
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
          {activeTab === "overview" && (
            <>
              {loading ? (
                <div className="text-sm text-slate-600">Loading your communication workspace…</div>
              ) : error ? (
                <div className="rounded-[24px] border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</div>
              ) : (
                <div className="grid gap-6 xl:grid-cols-2">
                  <section>
                    <div className="mb-4 flex items-center justify-between">
                      <h2 className="text-lg font-semibold text-slate-900">Recent notifications</h2>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate-600">
                        {notifications.length}
                      </span>
                    </div>
                    {notifications.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                        No notifications yet.
                      </div>
                    ) : (
                      <ul className="space-y-3">
                        {notifications.map((notification) => (
                          <li key={notification.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold text-slate-900">{notification.title}</p>
                                <p className="mt-1 text-sm text-slate-600">{notification.message}</p>
                              </div>
                              <span className="rounded-full bg-[#0a4d8c] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-white">
                                {notification.priority}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <section>
                    <div className="mb-4 flex items-center justify-between">
                      <h2 className="text-lg font-semibold text-slate-900">System status</h2>
                    </div>
                    <div className="space-y-3">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-sm text-slate-500">Active ambassadors</p>
                        <p className="mt-1 text-2xl font-black text-slate-900">—</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-sm text-slate-500">Open support tickets</p>
                        <p className="mt-1 text-2xl font-black text-slate-900">—</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-sm text-slate-500">Pending applications</p>
                        <p className="mt-1 text-2xl font-black text-slate-900">—</p>
                      </div>
                    </div>
                  </section>
                </div>
              )}
            </>
          )}

          {activeTab === "announcements" && <AnnouncementsSection />}

          {activeTab === "tickets" && <SupportTicketsSection />}

          {activeTab === "conversations" && (
            <div className="space-y-3">
              {conversations.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  No conversations available yet.
                </div>
              ) : (
                conversations.map((conversation) => (
                  <div key={conversation.conversation_id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">
                          {conversation.communication_conversations?.title || "Conversation"}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {conversation.communication_conversations?.conversation_type || "System conversation"}
                        </p>
                      </div>
                      <a
                        href={`/communication/conversations/${conversation.conversation_id}`}
                        className="rounded-full bg-[#0a4d8c] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-white hover:bg-[#083a6b]"
                      >
                        View
                      </a>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "conversations" && (
            <div className="space-y-3">
              {conversations.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  No conversations available yet.
                </div>
              ) : (
                conversations.map((conversation) => (
                  <div key={conversation.conversation_id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">
                          {conversation.communication_conversations?.title || "Conversation"}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {conversation.communication_conversations?.conversation_type || "System conversation"}
                        </p>
                      </div>
                      <a
                        href={`/communication/conversations/${conversation.conversation_id}`}
                        className="rounded-full bg-[#0a4d8c] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-white hover:bg-[#083a6b]"
                      >
                        View
                      </a>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
