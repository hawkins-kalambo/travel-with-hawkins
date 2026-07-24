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

export default function AmbassadorCommunicationPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        setTickets(Array.isArray(body.tickets) ? body.tickets : []);
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
            <h1 className="mt-2 text-3xl font-black text-slate-900">Ambassador inbox</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Keep up with updates from Travel with Hawkins and submit support requests when you need help.
            </p>
          </div>
          <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
            Ambassador workspace
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-[24px] border border-slate-200 bg-white p-6 text-sm text-slate-600">Loading your inbox…</div>
      ) : error ? (
        <div className="rounded-[24px] border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Notifications</h2>
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
                    <p className="font-semibold text-slate-900">{notification.title}</p>
                    <p className="mt-1 text-sm text-slate-600">{notification.message}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Support tickets</h2>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate-600">
                {tickets.length}
              </span>
            </div>
            {tickets.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                You have no support tickets yet.
              </div>
            ) : (
              <ul className="space-y-3">
                {tickets.map((ticket) => (
                  <li key={ticket.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="font-semibold text-slate-900">{ticket.subject}</p>
                    <p className="mt-1 text-sm text-slate-600">{ticket.category}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
