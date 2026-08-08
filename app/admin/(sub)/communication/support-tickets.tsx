"use client";

import { useCallback, useEffect, useState } from "react";
import { authFetch } from "@/lib/auth";
import Badge from "@/app/components/ui/Badge";
import { LoadingState } from "@/app/components/ui/Spinner";
import TicketReplyThread from "@/app/components/ui/TicketReplyThread";
import { useTicketReplies } from "@/lib/hooks/useTicketReplies";
import { ticketStatusTone } from "@/lib/statusTones";

type Ticket = {
  id: string;
  subject: string;
  description: string;
  category: string;
  status: string;
  priority: string;
  requester_id: string;
  assignee_id?: string | null;
  created_at?: string;
  profiles?: {
    full_name?: string;
    email?: string;
  } | null;
};

type StaffMember = {
  id: string;
  full_name?: string | null;
  email?: string | null;
};

export default function SupportTicketsSection() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [creating, setCreating] = useState(false);
  const { expandedTicketId, replies, repliesLoading, replyBody, setReplyBody, sendingReply, replyError, toggleTicket, sendReply } = useTicketReplies();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ticketsRes, staffRes] = await Promise.all([authFetch("/api/support-tickets"), authFetch("/api/admin/staff")]);
      const data = await ticketsRes.json();
      if (!ticketsRes.ok || !data?.success) throw new Error(data?.error || "Unable to load tickets");
      setTickets(Array.isArray(data.tickets) ? data.tickets : []);

      const staffData = await staffRes.json();
      if (staffRes.ok && staffData?.success) {
        setStaff(Array.isArray(staffData.staff) ? staffData.staff : []);
      }
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Unable to load tickets" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const assignTicket = async (id: string, assigneeId: string) => {
    if (!assigneeId) return;
    try {
      const res = await authFetch("/api/support-tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, assignee_id: assigneeId, status: "assigned" }),
      });
      if (!res.ok) throw new Error("Failed to assign ticket");
      await load();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to assign ticket" });
    }
  };

  const filteredTickets = tickets.filter((ticket) => statusFilter === "all" || ticket.status === statusFilter);

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      const res = await authFetch("/api/support-tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed to update ticket");
      await load();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to update ticket" });
    }
  };

  const handleCreateTicket = async () => {
    if (!subject.trim() || !description.trim()) {
      setMessage({ type: "error", text: "Subject and description are required" });
      return;
    }

    setCreating(true);
    setMessage(null);
    try {
      const res = await authFetch("/api/support-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, description, category }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to create ticket");

      setSubject("");
      setDescription("");
      setCategory("general");
      setMessage({ type: "success", text: "Support ticket created successfully" });
      await load();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to create ticket" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-800">Create support ticket</h3>
        <p className="mt-1 text-sm text-gray-600">Open a new support request from the same workspace used to manage existing activity.</p>

        <div className="mt-4 space-y-4">
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Subject"
            className="input-field"
          />

          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Describe the issue or request"
            rows={4}
            className="input-field"
          />

          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="input-field md:w-56">
              <option value="general">General</option>
              <option value="booking">Booking</option>
              <option value="payment">Payment</option>
              <option value="account">Account</option>
            </select>
            <button
              onClick={() => void handleCreateTicket()}
              disabled={creating || !subject.trim() || !description.trim()}
              className="btn-primary disabled:opacity-60"
            >
              {creating ? "Creating..." : "Create ticket"}
            </button>
          </div>

          {message ? (
            <div className={`rounded-lg p-3 text-sm ${message.type === "success" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
              {message.text}
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800">Support tickets</h3>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input-field text-sm"
          >
            <option value="all">All statuses</option>
            <option value="open">Open</option>
            <option value="assigned">Assigned</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        {loading ? (
          <LoadingState label="Loading tickets…" />
        ) : filteredTickets.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
            No {statusFilter !== "all" ? statusFilter : ""} support tickets.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTickets.map((ticket) => (
              <div key={ticket.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-gray-800">{ticket.subject}</h4>
                      <Badge tone={ticketStatusTone(ticket.status)}>{ticket.status}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-gray-600">{ticket.description}</p>
                    <p className="mt-2 text-xs text-gray-500">
                      Category: <span className="font-semibold">{ticket.category}</span> • Requester:{" "}
                      <span className="font-semibold">{ticket.profiles?.full_name || "Unknown"}</span>
                    </p>
                  </div>

                  <div className="flex flex-col gap-2">
                    <select
                      value={ticket.status}
                      onChange={(e) => void updateStatus(ticket.id, e.target.value)}
                      className="input-field text-xs"
                    >
                      <option value="open">Open</option>
                      <option value="assigned">Assigned</option>
                      <option value="in_progress">In Progress</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>
                    <select
                      value={ticket.assignee_id || ""}
                      onChange={(e) => void assignTicket(ticket.id, e.target.value)}
                      className="input-field text-xs"
                    >
                      <option value="">Unassigned</option>
                      {staff.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.full_name || member.email || member.id}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => toggleTicket(ticket.id)}
                      className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      {expandedTicketId === ticket.id ? "Hide replies" : "View / reply"}
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
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
