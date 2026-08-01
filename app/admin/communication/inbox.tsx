"use client";

import { useEffect, useMemo, useState } from "react";
import { authFetch } from "@/lib/auth";

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

type CustomerOption = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
};

export default function InboxSection({ conversations, onRefresh }: { conversations: ConversationItem[]; onRefresh: () => Promise<void> }) {
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [msgTitle, setMsgTitle] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);

  useEffect(() => {
    const loadCustomers = async () => {
      try {
        const response = await authFetch("/api/admin/users");
        const body = await response.json();
        if (response.ok && body?.success) {
          const customerRows = (Array.isArray(body.users) ? body.users : []).filter(
            (user: CustomerOption) => user.role === "customer"
          );
          setCustomers(customerRows);
        }
      } catch {
        // Non-fatal — customer picker will just show no results.
      }
    };
    void loadCustomers();
  }, []);

  const filteredCustomers = useMemo(() => {
    const term = customerSearch.trim().toLowerCase();
    if (!term) return customers.slice(0, 8);
    return customers
      .filter((customer) => `${customer.full_name || ""} ${customer.email}`.toLowerCase().includes(term))
      .slice(0, 8);
  }, [customers, customerSearch]);

  const handleSendDirectMessage = async () => {
    if (!selectedCustomer || !msgTitle.trim() || !msgBody.trim()) {
      setSendResult("Select a customer, and enter a subject and message");
      return;
    }

    setSending(true);
    setSendResult(null);
    try {
      const response = await authFetch("/api/communication/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: msgTitle.trim(),
          body: msgBody.trim(),
          recipientId: selectedCustomer.id,
        }),
      });
      const body = await response.json();
      if (!response.ok || !body?.success) {
        throw new Error(body?.error || "Unable to send message");
      }

      setMsgTitle("");
      setMsgBody("");
      setSelectedCustomer(null);
      setCustomerSearch("");
      setSendResult(`Message delivered to ${selectedCustomer.full_name || selectedCustomer.email}'s inbox`);
      await onRefresh();
    } catch (error) {
      setSendResult(error instanceof Error ? error.message : "Unable to send message");
    } finally {
      setSending(false);
    }
  };

  const handleCreateConversation = async () => {
    if (!draftTitle.trim() || !draftBody.trim()) {
      setMessage("Title and message are required");
      return;
    }

    setCreating(true);
    setMessage(null);
    try {
      const response = await authFetch("/api/communication/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: draftTitle.trim(), body: draftBody.trim() }),
      });
      const body = await response.json();
      if (!response.ok || !body?.success) {
        throw new Error(body?.error || "Unable to start conversation");
      }

      setDraftTitle("");
      setDraftBody("");
      setMessage("Conversation started successfully");
      await onRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to start conversation");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-[24px] border border-[#0a4d8c]/20 bg-gradient-to-br from-[#f6fbff] to-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Message a customer</h3>
        <p className="mt-1 text-sm text-slate-600">Send a direct message that lands in the customer&apos;s dashboard inbox.</p>

        <div className="mt-4 space-y-4">
          <div className="relative">
            <input
              value={selectedCustomer ? `${selectedCustomer.full_name || "Unnamed"} · ${selectedCustomer.email}` : customerSearch}
              onChange={(event) => {
                setSelectedCustomer(null);
                setCustomerSearch(event.target.value);
                setCustomerPickerOpen(true);
              }}
              onFocus={() => setCustomerPickerOpen(true)}
              placeholder="Search customers by name or email"
              className="input-field"
            />
            {customerPickerOpen && !selectedCustomer ? (
              <div className="absolute z-10 mt-2 max-h-64 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-lg">
                {filteredCustomers.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-slate-500">No matching customers</p>
                ) : (
                  filteredCustomers.map((customer) => (
                    <button
                      key={customer.id}
                      onClick={() => {
                        setSelectedCustomer(customer);
                        setCustomerPickerOpen(false);
                      }}
                      className="flex w-full flex-col items-start px-4 py-2.5 text-left hover:bg-slate-50"
                    >
                      <span className="text-sm font-semibold text-slate-900">{customer.full_name || "Unnamed customer"}</span>
                      <span className="text-xs text-slate-500">{customer.email}</span>
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>

          <input
            value={msgTitle}
            onChange={(event) => setMsgTitle(event.target.value)}
            placeholder="Subject"
            className="input-field"
          />
          <textarea
            value={msgBody}
            onChange={(event) => setMsgBody(event.target.value)}
            rows={4}
            placeholder="Write your message"
            className="input-field"
          />
          <button
            onClick={() => void handleSendDirectMessage()}
            disabled={sending || !selectedCustomer || !msgTitle.trim() || !msgBody.trim()}
            className="btn-primary disabled:opacity-60"
          >
            {sending ? "Sending..." : "Send message"}
          </button>
          {sendResult ? (
            <div className={`rounded-lg p-3 text-sm ${sendResult.includes("delivered") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
              {sendResult}
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900">Start a new conversation</h3>
        <p className="mt-1 text-sm text-slate-600">Kick off an internal message thread for operations, support, or follow-up work.</p>

        <div className="mt-4 space-y-4">
          <input
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            placeholder="Conversation title"
            className="input-field"
          />
          <textarea
            value={draftBody}
            onChange={(event) => setDraftBody(event.target.value)}
            rows={4}
            placeholder="Write the opening message"
            className="input-field"
          />
          <button
            onClick={() => void handleCreateConversation()}
            disabled={creating || !draftTitle.trim() || !draftBody.trim()}
            className="btn-primary disabled:opacity-60"
          >
            {creating ? "Starting..." : "Start conversation"}
          </button>
          {message ? <div className={`rounded-lg p-3 text-sm ${message.includes("success") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{message}</div> : null}
        </div>
      </div>

      <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Recent conversations</h3>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate-600">
            {conversations.length}
          </span>
        </div>

        {conversations.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            No conversations yet. Start one to keep communication flowing.
          </div>
        ) : (
          <div className="space-y-3">
            {conversations.map((conversation) => (
              <div key={conversation.conversation_id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{conversation.communication_conversations?.title || "Conversation"}</p>
                    <p className="mt-1 text-sm text-slate-600">{conversation.communication_conversations?.conversation_type || "System conversation"}</p>
                  </div>
                  <a href={`/communication/conversations/${conversation.conversation_id}`} className="rounded-full bg-[#0a4d8c] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-white hover:bg-[#083a6b]">
                    Open
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
