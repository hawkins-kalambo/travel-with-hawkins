"use client";

import { useCallback, useEffect, useState } from "react";
import { authFetch } from "@/lib/auth";
import { LoadingState } from "@/app/components/ui/Spinner";
import Badge, { type BadgeTone } from "@/app/components/ui/Badge";

type Contact = {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  booking_count: number;
  last_destination: string | null;
  last_booked_at: string | null;
  last_source: string | null;
  sms_opt_out: boolean;
  email_opt_out: boolean;
};

type SentMessage = {
  id: string;
  subject: string | null;
  body: string;
  channels: string[];
  audience: "all" | "selected";
  recipient_count: number;
  sms_sent: number;
  sms_failed: number;
  sms_skipped: number;
  email_sent: number;
  email_failed: number;
  email_skipped: number;
  status: "sending" | "sent" | "partial" | "failed";
  created_at: string;
};

const PAGE_SIZE = 50;
const MAX_MESSAGE_LENGTH = 2000;

const STATUS_TONE: Record<SentMessage["status"], BadgeTone> = {
  sending: "info",
  sent: "success",
  partial: "warning",
  failed: "danger",
};

// GSM-7 messages split at 160/153 characters; anything outside it (emoji,
// curly quotes, most accented letters) forces UCS-2 at 70/67, which can
// triple the cost of a bulk send.
function smsParts(text: string): { parts: number; unicode: boolean } {
  const unicode = /[^\n\r\x20-\x7E£¥èéùìòÇØøÅåÄäÖöÑñÜüß]/.test(text);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  if (text.length === 0) return { parts: 0, unicode };
  return { parts: text.length <= single ? 1 : Math.ceil(text.length / multi), unicode };
}

export default function CustomerMessagesSection() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [allContactsTotal, setAllContactsTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [selected, setSelected] = useState<Map<string, Contact>>(new Map());

  const [history, setHistory] = useState<SentMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const [audience, setAudience] = useState<"all" | "selected">("selected");
  const [useSms, setUseSms] = useState(true);
  const [useEmail, setUseEmail] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadContacts = useCallback(async () => {
    setLoadingContacts(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
      if (appliedSearch) params.set("search", appliedSearch);
      const response = await authFetch(`/api/admin/customer-contacts?${params}`);
      const data = await response.json();
      if (!response.ok || !data?.success) throw new Error(data?.error || "Unable to load customers");
      setContacts(Array.isArray(data.contacts) ? data.contacts : []);
      setTotal(Number(data.total) || 0);
      if (!appliedSearch) setAllContactsTotal(Number(data.total) || 0);
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Unable to load customers" });
    } finally {
      setLoadingContacts(false);
    }
  }, [page, appliedSearch]);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const response = await authFetch("/api/admin/customer-messages");
      const data = await response.json();
      if (!response.ok || !data?.success) throw new Error(data?.error || "Unable to load sent messages");
      setHistory(Array.isArray(data.messages) ? data.messages : []);
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Unable to load sent messages" });
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadContacts(), 0);
    return () => window.clearTimeout(timer);
  }, [loadContacts]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadHistory(), 0);
    return () => window.clearTimeout(timer);
  }, [loadHistory]);

  const toggleContact = (contact: Contact) => {
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(contact.id)) next.delete(contact.id);
      else next.set(contact.id, contact);
      return next;
    });
    setAudience("selected");
  };

  const allOnPageSelected = contacts.length > 0 && contacts.every((contact) => selected.has(contact.id));
  const togglePage = () => {
    setSelected((current) => {
      const next = new Map(current);
      for (const contact of contacts) {
        if (allOnPageSelected) next.delete(contact.id);
        else next.set(contact.id, contact);
      }
      return next;
    });
    setAudience("selected");
  };

  const updateOptOut = async (contact: Contact, field: "sms_opt_out" | "email_opt_out") => {
    try {
      const response = await authFetch("/api/admin/customer-contacts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: contact.id, [field]: !contact[field] }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success) throw new Error(data?.error || "Unable to update customer");
      setContacts((current) => current.map((item) => (item.id === contact.id ? data.contact : item)));
      setSelected((current) => (current.has(contact.id) ? new Map(current).set(contact.id, data.contact) : current));
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Unable to update customer" });
    }
  };

  const recipientCount = audience === "all" ? allContactsTotal : selected.size;
  const { parts, unicode } = smsParts(body);
  const channels = [useSms ? "sms" : null, useEmail ? "email" : null].filter(Boolean) as string[];
  const canSend = !sending && body.trim().length > 0 && channels.length > 0 && recipientCount > 0;

  const handleSend = async () => {
    if (!canSend) return;
    const channelLabel = channels.map((channel) => channel.toUpperCase()).join(" + ");
    const costLine = useSms ? `\n\nSMS: ${parts} part${parts === 1 ? "" : "s"} per customer (about ${parts * recipientCount} SMS credits).` : "";
    const confirmed = window.confirm(
      `Send this ${channelLabel} message to ${recipientCount} customer${recipientCount === 1 ? "" : "s"}?${costLine}\n\nThis cannot be undone.`
    );
    if (!confirmed) return;

    setSending(true);
    setNotice(null);
    try {
      const response = await authFetch("/api/admin/customer-messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: useEmail ? subject : undefined,
          body,
          channels,
          audience,
          contactIds: audience === "selected" ? [...selected.keys()] : [],
        }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success) throw new Error(data?.error || "Unable to send the message");

      const { sms, email } = data.summary as { sms: { sent: number; failed: number }; email: { sent: number; failed: number } };
      const outcomes = [
        useSms ? `SMS ${sms.sent} sent${sms.failed ? `, ${sms.failed} failed` : ""}` : null,
        useEmail ? `Email ${email.sent} sent${email.failed ? `, ${email.failed} failed` : ""}` : null,
      ].filter(Boolean);
      setNotice({ type: data.summary.status === "failed" ? "error" : "success", text: `Message ${data.summary.status}. ${outcomes.join(" · ")}` });
      setBody("");
      setSubject("");
      setSelected(new Map());
      await loadHistory();
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Unable to send the message" });
    } finally {
      setSending(false);
    }
  };

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-800">Message customers</h3>
          <p className="mt-1 text-sm text-gray-600">
            Write one message and send it by SMS (from HAWKINS) and/or email to every customer who has booked, or to the customers you select below.
          </p>
        </div>

        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${audience === "all" ? "border-primary-700 bg-primary-50 text-primary-700" : "border-gray-200 bg-white text-gray-700"}`}>
              <input type="radio" name="audience" checked={audience === "all"} onChange={() => setAudience("all")} />
              All customers ({allContactsTotal})
            </label>
            <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${audience === "selected" ? "border-primary-700 bg-primary-50 text-primary-700" : "border-gray-200 bg-white text-gray-700"}`}>
              <input type="radio" name="audience" checked={audience === "selected"} onChange={() => setAudience("selected")} />
              Selected customers ({selected.size})
            </label>
          </div>

          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700">
              <input type="checkbox" checked={useSms} onChange={(event) => setUseSms(event.target.checked)} />
              SMS
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700">
              <input type="checkbox" checked={useEmail} onChange={(event) => setUseEmail(event.target.checked)} />
              Email
            </label>
          </div>

          {useEmail ? (
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Email subject (default: Message from Travel With Hawkins)"
              maxLength={150}
              className="input-field"
            />
          ) : null}

          <div>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Write your message to customers"
              rows={5}
              maxLength={MAX_MESSAGE_LENGTH}
              className="input-field"
            />
            <div className="mt-1 flex flex-wrap justify-between gap-2 text-xs text-gray-500">
              <span>
                {body.length}/{MAX_MESSAGE_LENGTH} characters
                {useSms && parts > 0 ? ` · ${parts} SMS part${parts === 1 ? "" : "s"} per customer` : ""}
              </span>
              {useSms && unicode ? (
                <span className="font-semibold text-warning">Emoji or special characters make each SMS part shorter (70 chars).</span>
              ) : null}
            </div>
          </div>

          {useEmail && audience === "selected" && selected.size > 0 ? (
            <p className="text-xs text-gray-500">
              {[...selected.values()].filter((contact) => !contact.email).length} selected customer(s) have no email and will only get SMS.
            </p>
          ) : null}

          {notice ? (
            <div className={`rounded-lg p-3 text-sm ${notice.type === "success" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
              {notice.text}
            </div>
          ) : null}

          <button onClick={() => void handleSend()} disabled={!canSend} className="btn-primary disabled:opacity-60">
            {sending ? "Sending..." : `Send to ${recipientCount} customer${recipientCount === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Customer contacts</h3>
            <p className="mt-1 text-sm text-gray-600">Saved automatically whenever someone books, on the website or WhatsApp.</p>
          </div>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(0);
              setAppliedSearch(search.trim());
            }}
          >
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, phone, email, route"
              className="input-field md:w-72"
            />
            <button type="submit" className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
              Search
            </button>
          </form>
        </div>

        {selected.size > 0 ? (
          <div className="mb-3 flex items-center justify-between rounded-lg bg-primary-50 px-3 py-2 text-sm text-primary-700">
            <span className="font-semibold">{selected.size} selected</span>
            <button onClick={() => setSelected(new Map())} className="font-semibold underline">
              Clear selection
            </button>
          </div>
        ) : null}

        {loadingContacts ? (
          <LoadingState label="Loading customers…" />
        ) : contacts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
            {appliedSearch ? "No customers match this search." : "No customer contacts yet. They appear here after a customer books."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-180 text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase tracking-[0.15em] text-gray-500">
                  <th className="py-2 pr-3">
                    <input type="checkbox" checked={allOnPageSelected} onChange={togglePage} aria-label="Select all on this page" />
                  </th>
                  <th className="py-2 pr-3">Customer</th>
                  <th className="py-2 pr-3">Phone</th>
                  <th className="py-2 pr-3">Email</th>
                  <th className="py-2 pr-3">Bookings</th>
                  <th className="py-2 pr-3">Last trip</th>
                  <th className="py-2 pr-3">Receives</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) => (
                  <tr key={contact.id} className="border-b border-gray-100 align-top">
                    <td className="py-2 pr-3">
                      <input
                        type="checkbox"
                        checked={selected.has(contact.id)}
                        onChange={() => toggleContact(contact)}
                        aria-label={`Select ${contact.name || contact.phone}`}
                      />
                    </td>
                    <td className="py-2 pr-3 font-semibold text-gray-800">
                      {contact.name || "—"}
                      {contact.last_source === "whatsapp" ? <span className="ml-2 text-xs font-normal text-gray-500">WhatsApp</span> : null}
                    </td>
                    <td className="py-2 pr-3 text-gray-700">{contact.phone}</td>
                    <td className="py-2 pr-3 text-gray-700">{contact.email || "—"}</td>
                    <td className="py-2 pr-3 text-gray-700">{contact.booking_count}</td>
                    <td className="py-2 pr-3 text-gray-600">
                      <div>{contact.last_destination || "—"}</div>
                      {contact.last_booked_at ? (
                        <div className="text-xs text-gray-500">{new Date(contact.last_booked_at).toLocaleDateString()}</div>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-wrap gap-1">
                        <button onClick={() => void updateOptOut(contact, "sms_opt_out")} title="Click to toggle SMS">
                          <Badge tone={contact.sms_opt_out ? "danger" : "success"}>{contact.sms_opt_out ? "SMS off" : "SMS"}</Badge>
                        </button>
                        {contact.email ? (
                          <button onClick={() => void updateOptOut(contact, "email_opt_out")} title="Click to toggle email">
                            <Badge tone={contact.email_opt_out ? "danger" : "success"}>{contact.email_opt_out ? "Email off" : "Email"}</Badge>
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > PAGE_SIZE ? (
          <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
            <span>
              Page {page + 1} of {pageCount} · {total} customers
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                disabled={page === 0}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
                disabled={page + 1 >= pageCount}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800">Sent messages</h3>
          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-gray-600">{history.length}</span>
        </div>

        {loadingHistory ? (
          <LoadingState label="Loading sent messages…" />
        ) : history.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">No messages sent to customers yet.</div>
        ) : (
          <ul className="space-y-3">
            {history.map((item) => (
              <li key={item.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {item.subject ? <p className="font-semibold text-gray-800">{item.subject}</p> : null}
                    <p className="mt-1 whitespace-pre-line text-sm text-gray-600">{item.body}</p>
                    <p className="mt-2 text-xs text-gray-500">
                      {new Date(item.created_at).toLocaleString()} · {item.audience === "all" ? "All customers" : "Selected customers"} · {item.recipient_count} recipient{item.recipient_count === 1 ? "" : "s"}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {item.channels.includes("sms") ? `SMS: ${item.sms_sent} sent, ${item.sms_failed} failed, ${item.sms_skipped} skipped` : ""}
                      {item.channels.includes("sms") && item.channels.includes("email") ? " · " : ""}
                      {item.channels.includes("email") ? `Email: ${item.email_sent} sent, ${item.email_failed} failed, ${item.email_skipped} skipped` : ""}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONE[item.status]}>{item.status}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
