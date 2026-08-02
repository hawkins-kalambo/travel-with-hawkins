"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
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
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const customerPickerRef = useRef<HTMLDivElement | null>(null);
  const [msgTitle, setMsgTitle] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!customerPickerOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (customerPickerRef.current && !customerPickerRef.current.contains(event.target as Node)) {
        setCustomerPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [customerPickerOpen]);

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
      setSendResult({ type: "error", text: "Select a customer, and enter a subject and message" });
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
      setSendResult({ type: "success", text: `Message delivered to ${selectedCustomer.full_name || selectedCustomer.email}'s inbox` });
      await onRefresh();
    } catch (error) {
      setSendResult({ type: "error", text: error instanceof Error ? error.message : "Unable to send message" });
    } finally {
      setSending(false);
    }
  };

  const handleCreateConversation = async () => {
    if (!draftTitle.trim() || !draftBody.trim()) {
      setMessage({ type: "error", text: "Title and message are required" });
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
      setMessage({ type: "success", text: "Conversation started successfully" });
      await onRefresh();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Unable to start conversation" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-primary-700/20 bg-gradient-to-br from-primary-50 to-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-800">Message a customer</h3>
        <p className="mt-1 text-sm text-gray-600">Send a direct message that lands in the customer&apos;s dashboard inbox.</p>

        <div className="mt-4 space-y-4">
          <div className="relative" ref={customerPickerRef}>
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
              <div className="absolute z-10 mt-2 max-h-64 w-full overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-lg">
                {filteredCustomers.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-gray-500">No matching customers</p>
                ) : (
                  filteredCustomers.map((customer) => (
                    <button
                      key={customer.id}
                      onClick={() => {
                        setSelectedCustomer(customer);
                        setCustomerPickerOpen(false);
                      }}
                      className="flex w-full flex-col items-start px-4 py-2.5 text-left hover:bg-gray-50"
                    >
                      <span className="text-sm font-semibold text-gray-800">{customer.full_name || "Unnamed customer"}</span>
                      <span className="text-xs text-gray-500">{customer.email}</span>
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
            <div className={`rounded-lg p-3 text-sm ${sendResult.type === "success" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
              {sendResult.text}
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-800">Start a new conversation</h3>
        <p className="mt-1 text-sm text-gray-600">Kick off an internal message thread for operations, support, or follow-up work.</p>

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
          {message ? (
            <div className={`rounded-lg p-3 text-sm ${message.type === "success" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>{message.text}</div>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800">Recent conversations</h3>
          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-gray-600">
            {conversations.length}
          </span>
        </div>

        {conversations.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
            No conversations yet. Start one to keep communication flowing.
          </div>
        ) : (
          <div className="space-y-3">
            {conversations.map((conversation) => (
              <div key={conversation.conversation_id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-800">{conversation.communication_conversations?.title || "Conversation"}</p>
                    <p className="mt-1 text-sm text-gray-600">{conversation.communication_conversations?.conversation_type || "System conversation"}</p>
                  </div>
                  <Link href={`/communication/conversations/${conversation.conversation_id}`} className="rounded-full bg-primary-700 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-white hover:bg-primary-800">
                    Open
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
