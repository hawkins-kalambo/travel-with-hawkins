"use client";

import { useCallback, useEffect, useState } from "react";
import { authFetch } from "@/lib/auth";

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

export default function SupportTicketsSection() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [message, setMessage] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/support-tickets");
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || "Unable to load tickets");
      setTickets(Array.isArray(data.tickets) ? data.tickets : []);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to load tickets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
      setMessage(err instanceof Error ? err.message : "Failed to update ticket");
    }
  };

  const handleCreateTicket = async () => {
    if (!subject.trim() || !description.trim()) {
      setMessage("Subject and description are required");
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
      setMessage("Support ticket created successfully");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to create ticket");
    } finally {
      setCreating(false);
    }
  };

  const statusColors: Record<string, string> = {
    open: "border-blue-200 bg-blue-50 text-blue-700",
    assigned: "border-yellow-200 bg-yellow-50 text-yellow-700",
    in_progress: "border-orange-200 bg-orange-50 text-orange-700",
    resolved: "border-emerald-200 bg-emerald-50 text-emerald-700",
    closed: "border-slate-200 bg-slate-50 text-slate-700",
  };

  return (
    <div className="space-y-6">
      <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Create support ticket</h3>
        <p className="mt-1 text-sm text-slate-600">Open a new support request from the same workspace used to manage existing activity.</p>

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
            <div className={`rounded-lg p-3 text-sm ${message.includes("success") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
              {message}
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Support tickets</h3>
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
          <div className="text-sm text-slate-500">Loading tickets...</div>
        ) : filteredTickets.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            No {statusFilter !== "all" ? statusFilter : ""} support tickets.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTickets.map((ticket) => (
              <div key={ticket.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-slate-900">{ticket.subject}</h4>
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.2em] ${statusColors[ticket.status] || statusColors.open}`}>
                        {ticket.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{ticket.description}</p>
                    <p className="mt-2 text-xs text-slate-500">
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
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
