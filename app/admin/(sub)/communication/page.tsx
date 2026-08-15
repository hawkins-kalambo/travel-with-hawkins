"use client";

import { useEffect, useMemo, useState } from "react";
import { authFetch } from "@/lib/auth";
import AnnouncementsSection from "./announcements";
import BroadcastCenterSection from "./broadcasts";
import InboxSection from "./inbox";
import SupportTicketsSection from "./support-tickets";
import WhatsAppInboxSection from "./whatsapp-inbox";
import WebsiteChatInboxSection from "./website-chat-inbox";
import PageHeader from "@/app/components/ui/PageHeader";
import Badge from "@/app/components/ui/Badge";
import { LoadingState } from "@/app/components/ui/Spinner";
import { ticketPriorityTone } from "@/lib/statusTones";

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

type ActivityItem = {
  id: string;
  type: "notification" | "ticket" | "announcement";
  title: string;
  description: string;
  created_at?: string;
};

type Metrics = {
  totalNotifications: number;
  unreadNotifications: number;
  totalConversations: number;
  activeConversations: number;
  openSupportTickets: number;
  pendingSupportTickets: number;
  scheduledAnnouncements: number;
  publishedAnnouncements: number;
  broadcastCampaigns: number;
  messageDeliveryRate: number;
  averageSupportResponseTime: string;
};

function getNotificationCategory(type: string) {
  const normalized = type.toLowerCase();
  if (normalized.includes("booking")) return "Booking";
  if (normalized.includes("payment") || normalized.includes("commission")) return "Payment";
  if (normalized.includes("referral")) return "Referral";
  if (normalized.includes("application") || normalized.includes("ambassador")) return "Ambassador";
  if (normalized.includes("ticket") || normalized.includes("support")) return "Support";
  if (normalized.includes("announcement")) return "Announcement";
  return "System";
}

export default function AdminCommunicationPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "notifications" | "broadcasts" | "announcements" | "tickets" | "conversations" | "whatsapp" | "website">("overview");
  const [notificationSearch, setNotificationSearch] = useState("");
  const [notificationFilter, setNotificationFilter] = useState("all");
  const [metrics, setMetrics] = useState<Metrics>({
    totalNotifications: 0,
    unreadNotifications: 0,
    totalConversations: 0,
    activeConversations: 0,
    openSupportTickets: 0,
    pendingSupportTickets: 0,
    scheduledAnnouncements: 0,
    publishedAnnouncements: 0,
    broadcastCampaigns: 0,
    messageDeliveryRate: 100,
    averageSupportResponseTime: "0m",
  });
  const [activityFeed, setActivityFeed] = useState<ActivityItem[]>([]);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      await loadCommunicationCenter();
      setLoading(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const filteredNotifications = useMemo(() => {
    const search = notificationSearch.trim().toLowerCase();
    return notifications.filter((notification) => {
      const category = getNotificationCategory(notification.type);
      const matchesFilter = notificationFilter === "all" || category === notificationFilter;
      const matchesSearch = !search || `${notification.title} ${notification.message}`.toLowerCase().includes(search);
      return matchesFilter && matchesSearch;
    });
  }, [notifications, notificationFilter, notificationSearch]);

  const handleNotificationAction = async (id: string, action: "read" | "archive" | "unread") => {
    try {
      const response = await authFetch("/api/communication/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const body = await response.json();
      if (!response.ok || !body?.success) {
        throw new Error(body?.error || "Unable to update notification");
      }
      setNotifications((current) => {
        if (action === "archive") {
          return current.filter((notification) => notification.id !== id);
        }
        return current.map((notification) => (notification.id === id ? { ...notification, read_at: action === "read" ? new Date().toISOString() : null } : notification));
      });
      setMetrics((current) => ({
        ...current,
        unreadNotifications: action === "read"
          ? Math.max(0, current.unreadNotifications - 1)
          : action === "unread"
            ? current.unreadNotifications + 1
            : current.unreadNotifications,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update notification");
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const response = await authFetch("/api/communication/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
      });
      const body = await response.json();
      if (!response.ok || !body?.success) {
        throw new Error(body?.error || "Unable to mark notifications as read");
      }
      setNotifications((current) => current.map((notification) => ({ ...notification, read_at: new Date().toISOString() })));
      setMetrics((current) => ({ ...current, unreadNotifications: 0 }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to mark notifications as read");
    }
  };

  async function loadCommunicationCenter() {
    try {
      const response = await authFetch("/api/communications");
      const body = await response.json();
      if (!response.ok || !body?.success) {
        throw new Error(body?.error || "Unable to load communication center");
      }
      setNotifications(Array.isArray(body.notifications) ? body.notifications : []);
      setConversations(Array.isArray(body.conversations) ? body.conversations : []);
      setMetrics(body.metrics || {
        totalNotifications: 0,
        unreadNotifications: 0,
        totalConversations: 0,
        activeConversations: 0,
        openSupportTickets: 0,
        pendingSupportTickets: 0,
        scheduledAnnouncements: 0,
        publishedAnnouncements: 0,
        broadcastCampaigns: 0,
        messageDeliveryRate: 100,
        averageSupportResponseTime: "0m",
      });
      setActivityFeed(Array.isArray(body.activityFeed) ? body.activityFeed : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load communication center");
    }
  }

  const metricCards = [
    { label: "Total notifications", value: metrics.totalNotifications, detail: `${metrics.unreadNotifications} unread` },
    { label: "Open support tickets", value: metrics.openSupportTickets, detail: `${metrics.pendingSupportTickets} pending` },
    { label: "Published announcements", value: metrics.publishedAnnouncements, detail: `${metrics.scheduledAnnouncements} scheduled` },
    { label: "Delivery rate", value: `${metrics.messageDeliveryRate}%`, detail: "Operational readiness" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Communication center"
        title="Enterprise communication workspace"
        description="Manage notifications, conversations, announcements, and support operations from a single command center."
        actions={<span className="rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700">Admin workspace</span>}
      />

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap gap-1 border-b border-gray-200 p-1">
          {[
            { key: "overview", label: "Overview" },
            { key: "notifications", label: "Notifications" },
            { key: "broadcasts", label: "Broadcasts" },
            { key: "announcements", label: "Announcements" },
            { key: "tickets", label: "Support Desk" },
            { key: "conversations", label: "Inbox" },
            { key: "whatsapp", label: "WhatsApp" },
            { key: "website", label: "Website Chat" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                activeTab === tab.key ? "bg-primary-700 text-white" : "text-gray-700 hover:bg-gray-50"
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
                <LoadingState label="Loading your communication workspace…" />
              ) : error ? (
                <div className="rounded-2xl border border-danger/20 bg-danger/10 p-6 text-sm text-danger">{error}</div>
              ) : (
                <div className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {metricCards.map((card) => (
                      <div key={card.label} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                        <p className="text-sm text-gray-500">{card.label}</p>
                        <p className="mt-2 text-3xl font-black text-gray-800">{card.value}</p>
                        <p className="mt-1 text-sm text-gray-600">{card.detail}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                      <div className="mb-4 flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-gray-800">Recent communication activity</h2>
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-gray-600">
                          Live feed
                        </span>
                      </div>
                      {activityFeed.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                          No recent activity yet.
                        </div>
                      ) : (
                        <ul className="space-y-3">
                          {activityFeed.map((item) => (
                            <li key={item.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-semibold text-gray-800">{item.title}</p>
                                  <p className="mt-1 text-sm text-gray-600">{item.description}</p>
                                </div>
                                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                                  {item.created_at ? new Date(item.created_at).toLocaleDateString() : "Now"}
                                </span>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>

                    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                      <h2 className="text-lg font-semibold text-gray-800">Communication health</h2>
                      <div className="mt-4 space-y-3">
                        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                          <p className="text-sm text-gray-500">Unread notifications</p>
                          <p className="mt-1 text-2xl font-black text-gray-800">{metrics.unreadNotifications}</p>
                        </div>
                        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                          <p className="text-sm text-gray-500">Active conversations</p>
                          <p className="mt-1 text-2xl font-black text-gray-800">{metrics.activeConversations}</p>
                        </div>
                        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                          <p className="text-sm text-gray-500">Broadcast readiness</p>
                          <p className="mt-1 text-2xl font-black text-gray-800">{metrics.broadcastCampaigns}</p>
                        </div>
                      </div>
                    </section>
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === "notifications" && (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 md:flex-row md:items-center">
                <input
                  value={notificationSearch}
                  onChange={(event) => setNotificationSearch(event.target.value)}
                  placeholder="Search notifications"
                  className="input-field flex-1"
                />
                <select value={notificationFilter} onChange={(event) => setNotificationFilter(event.target.value)} className="input-field md:w-48">
                  <option value="all">All categories</option>
                  <option value="Booking">Booking</option>
                  <option value="Support">Support</option>
                  <option value="Announcement">Announcement</option>
                  <option value="System">System</option>
                </select>
                <button onClick={() => void handleMarkAllRead()} className="rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100">
                  Mark all read
                </button>
              </div>

              {filteredNotifications.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                  No notifications match the current view.
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredNotifications.map((notification) => {
                    const category = getNotificationCategory(notification.type);
                    const isUnread = !notification.read_at;
                    return (
                      <div key={notification.id} className={`rounded-2xl border p-4 ${isUnread ? "border-primary-700/20 bg-primary-50" : "border-gray-200 bg-white"}`}>
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold text-gray-800">{notification.title}</p>
                              <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-600">
                                {category}
                              </span>
                              <Badge tone={ticketPriorityTone(notification.priority)}>{notification.priority}</Badge>
                            </div>
                            <p className="mt-2 text-sm text-gray-600">{notification.message}</p>
                            <p className="mt-2 text-xs text-gray-500">
                              {notification.created_at ? new Date(notification.created_at).toLocaleString() : "Recently received"}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {isUnread ? (
                              <button onClick={() => void handleNotificationAction(notification.id, "read")} className="rounded-full bg-primary-700 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-white hover:bg-primary-800">
                                Mark read
                              </button>
                            ) : (
                              <button onClick={() => void handleNotificationAction(notification.id, "unread")} className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-gray-700 hover:bg-gray-50">
                                Mark unread
                              </button>
                            )}
                            <button onClick={() => void handleNotificationAction(notification.id, "archive")} className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-gray-700 hover:bg-gray-50">
                              Archive
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === "broadcasts" && <BroadcastCenterSection />}

          {activeTab === "announcements" && <AnnouncementsSection />}

          {activeTab === "tickets" && <SupportTicketsSection />}

          {activeTab === "conversations" && <InboxSection conversations={conversations} onRefresh={loadCommunicationCenter} />}
          {activeTab === "whatsapp" && <WhatsAppInboxSection />}
          {activeTab === "website" && <WebsiteChatInboxSection />}
        </div>
      </div>
    </div>
  );
}
