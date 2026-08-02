"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/auth";
import Card from "@/app/components/ui/Card";
import PageHeader from "@/app/components/ui/PageHeader";
import Badge from "@/app/components/ui/Badge";
import Button from "@/app/components/ui/Button";
import EmptyState from "@/app/components/ui/EmptyState";
import { LoadingState } from "@/app/components/ui/Spinner";
import TicketReplyThread from "@/app/components/ui/TicketReplyThread";
import { useTicketReplies } from "@/lib/hooks/useTicketReplies";
import { ticketStatusTone } from "@/lib/statusTones";
import { IconBell, IconInbox, IconTicket } from "@/app/components/Icon";

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

type AnnouncementItem = {
  id: string;
  title: string;
  body: string;
  pinned?: boolean;
  published_at?: string | null;
};

type FormMessage = { type: "success" | "error"; text: string };

export default function AmbassadorCommunicationPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [ticketMessage, setTicketMessage] = useState<FormMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { expandedTicketId, replies, repliesLoading, replyBody, setReplyBody, sendingReply, replyError, toggleTicket, sendReply } = useTicketReplies();

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
        setAnnouncements(Array.isArray(body.announcements) ? body.announcements : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load communication center");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const handleCreateTicket = async () => {
    setCreatingTicket(true);
    setTicketMessage(null);
    try {
      const res = await authFetch("/api/communication/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, description, category }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Failed to create ticket");
      }
      setSubject("");
      setDescription("");
      setCategory("general");
      setTicketMessage({ type: "success", text: "Support ticket created successfully." });
      const refreshed = await authFetch("/api/communications");
      const refreshedBody = await refreshed.json();
      if (refreshed.ok && refreshedBody?.success) {
        setTickets(Array.isArray(refreshedBody.tickets) ? refreshedBody.tickets : []);
      }
    } catch (err) {
      setTicketMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to create ticket" });
    } finally {
      setCreatingTicket(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Communication center"
        title="Ambassador inbox"
        description="Keep up with updates from Travel with Hawkins and submit support requests when you need help."
        actions={<span className="rounded-full border border-gray-200 bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700">Ambassador workspace</span>}
      />

      {loading ? (
        <Card>
          <LoadingState label="Loading your inbox…" />
        </Card>
      ) : error ? (
        <Card className="border-danger/20 bg-danger/5 text-danger">{error}</Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-3">
          {announcements.length > 0 && (
            <Card className="xl:col-span-3">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-800">Announcements</h2>
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-gray-600">{announcements.length}</span>
              </div>
              <ul className="grid gap-3 md:grid-cols-2">
                {announcements.map((announcement) => (
                  <li key={announcement.id} className={`rounded-2xl border p-4 ${announcement.pinned ? "border-warning/30 bg-warning/10" : "border-gray-200 bg-gray-100"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-gray-800">{announcement.title}</p>
                      {announcement.pinned && <Badge tone="warning">Pinned</Badge>}
                    </div>
                    <p className="mt-1 whitespace-pre-line text-sm text-gray-600">{announcement.body}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">Notifications</h2>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-gray-600">{notifications.length}</span>
            </div>
            {notifications.length === 0 ? (
              <EmptyState icon={<IconBell className="h-8 w-8" />} title="No notifications yet" />
            ) : (
              <ul className="space-y-3">
                {notifications.map((notification) => (
                  <li key={notification.id} className="rounded-2xl border border-gray-200 bg-gray-100 p-4">
                    <p className="font-semibold text-gray-800">{notification.title}</p>
                    <p className="mt-1 text-sm text-gray-600">{notification.message}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">Conversations</h2>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-gray-600">{conversations.length}</span>
            </div>
            {conversations.length === 0 ? (
              <EmptyState icon={<IconInbox className="h-8 w-8" />} title="No conversations yet" />
            ) : (
              <ul className="space-y-3">
                {conversations.map((conversation) => (
                  <li key={conversation.conversation_id} className="rounded-2xl border border-gray-200 bg-gray-100 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-gray-800">{conversation.communication_conversations?.title || "Conversation"}</p>
                        <p className="mt-1 text-sm text-gray-600">{conversation.communication_conversations?.conversation_type || "System conversation"}</p>
                      </div>
                      <Link href={`/communication/conversations/${conversation.conversation_id}`} className="btn-secondary text-xs">
                        View
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">Support tickets</h2>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-gray-600">{tickets.length}</span>
            </div>

            {tickets.length === 0 ? (
              <EmptyState icon={<IconTicket className="h-8 w-8" />} title="No support tickets yet" />
            ) : (
              <ul className="space-y-3">
                {tickets.map((ticket) => (
                  <li key={ticket.id} className="rounded-2xl border border-gray-200 bg-gray-100 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-gray-800">{ticket.subject}</p>
                        <p className="mt-1 text-sm text-gray-600">{ticket.category}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={ticketStatusTone(ticket.status)}>{ticket.status}</Badge>
                        <button
                          type="button"
                          onClick={() => toggleTicket(ticket.id)}
                          className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-primary-700 hover:bg-gray-100"
                        >
                          {expandedTicketId === ticket.id ? "Hide" : "View / reply"}
                        </button>
                      </div>
                    </div>

                    {expandedTicketId === ticket.id && (
                      <div className="mt-3">
                        <TicketReplyThread
                          replies={replies}
                          loading={repliesLoading}
                          replyBody={replyBody}
                          onReplyBodyChange={setReplyBody}
                          onSend={() => void sendReply(ticket.id)}
                          sending={sendingReply}
                          error={replyError}
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="xl:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">Create a support ticket</h2>
              <span className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-600">Fast response</span>
            </div>
            {ticketMessage && (
              <div className={`mb-4 rounded-2xl border p-4 text-sm font-medium ${ticketMessage.type === "success" ? "border-success/20 bg-success/10 text-success" : "border-danger/20 bg-danger/10 text-danger"}`}>
                {ticketMessage.text}
              </div>
            )}
            <div className="space-y-4">
              <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Ticket subject" className="input-field w-full" />
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Describe the issue or request" className="input-field w-full" />
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="input-field w-full">
                <option value="general">General</option>
                <option value="booking">Booking</option>
                <option value="commission">Commissions</option>
                <option value="technical">Technical</option>
              </select>
              <Button onClick={() => void handleCreateTicket()} disabled={creatingTicket || !subject.trim() || !description.trim()}>
                {creatingTicket ? "Creating ticket..." : "Submit ticket"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
