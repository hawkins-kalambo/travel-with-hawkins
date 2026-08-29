"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { authFetch } from "@/lib/auth";

type Contact = { id?: string; wa_id?: string; display_name?: string | null; language?: string; consent_status?: string };
type ListItem = {
  conversation_id: string; mode: string; status: string;
  assigned_to: string | null; assigned_agent_name: string | null;
  last_message_at: string; last_customer_message_at: string | null;
  preview: string; unread_count: number;
  contact?: Contact | Contact[] | null; bookingId?: string | null;
};
type SenderKind = "customer" | "agent" | "bot" | "automatic";
type Message = {
  id: string; body: string; kind: SenderKind; messageKind: string;
  attachments: unknown[]; templateName: string | null;
  deliveryStatus: string | null; errorCode: string | null;
  senderName: string | null; createdAt: string;
};
type BookingCard = {
  bookingId: string; passengerName: string; bookerPhone: string; email: string | null;
  route: string; requestedDate: string; status: string; source: string;
  transportAssigned: boolean; assignedAt: string | null;
  bookingFeeStatus: string; bookingFeeAmount: number;
  fareStatus: string; fareAmount: number; outstanding: number; deadline: string | null;
};
type Payment = { booking_id: string; payment_type: string; status: string; expected_amount: number; currency: string; paid_at: string | null };
type Note = { id: string; body: string; created_at: string; authorName: string | null };
type Agent = { id: string; full_name?: string; email?: string };
type MediaRow = {
  id: string; messageId: string | null; direction: "inbound" | "outbound";
  kind: "document" | "image"; mimeType: string;
  fileName: string; byteSize: number; status: string; errorCode: string | null;
  caption: string | null; createdAt: string; uploadedByName: string | null;
  linkedBookingId: string | null; isPaymentProof: boolean; reviewedByName: string | null;
};
type ReceiptRow = {
  paymentId: string; bookingId: string | null; paymentType: string | null;
  channel: string; status: string; errorMessage: string | null;
  sentAt: string | null; attempts: number;
};
type Detail = {
  conversation: {
    conversationId: string; waId: string; displayName: string | null; language: string;
    consentStatus: string | null; mode: string; status: string;
    assignedTo: string | null; assignedAgentName: string | null;
    serviceWindowExpiresAt: string | null; unreadCount: number;
    viewerId: string; viewerRole?: string;
  };
  messages: Message[]; notes: Note[]; bookings: BookingCard[]; phoneMatchBookings: BookingCard[];
  payments: Payment[]; receipts: ReceiptRow[]; agents: Agent[]; media: MediaRow[];
};

const ACCEPTED_FILE_TYPES = "application/pdf,image/jpeg,image/png";
function humanSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

const FILTERS = ["all", "unread", "waiting", "human", "bot", "resolved"] as const;
type Filter = (typeof FILTERS)[number];

const KIND_STYLE: Record<SenderKind, string> = {
  customer: "bg-gray-100 text-gray-900",
  agent: "ml-auto bg-primary-700 text-white",
  bot: "ml-auto bg-slate-600 text-white",
  automatic: "ml-auto bg-emerald-700 text-white",
};
const KIND_LABEL: Record<SenderKind, string> = { customer: "Customer", agent: "Agent", bot: "Bot", automatic: "Automated" };

function contactOf(item: ListItem): Contact {
  return (Array.isArray(item.contact) ? item.contact[0] : item.contact) || {};
}
function money(amount: number, currency = "MWK") {
  return `${currency} ${Math.round(amount).toLocaleString("en-MW")}`;
}
function when(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "—";
}
function relativeWindow(expiry: string | null) {
  if (!expiry) return { open: false, label: "No 24-hour window" };
  const ms = new Date(expiry).getTime() - Date.now();
  if (ms <= 0) return { open: false, label: "Service window closed — template only" };
  const hrs = Math.floor(ms / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  return { open: true, label: `Service window: ${hrs}h ${mins}m left` };
}

export default function WhatsAppInboxSection({ initialConversationId }: { initialConversationId?: string }) {
  const [items, setItems] = useState<ListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [assignTo, setAssignTo] = useState("");
  const [loadingList, setLoadingList] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mobilePane, setMobilePane] = useState<"list" | "thread">("list");
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const threadRef = useRef<HTMLDivElement | null>(null);
  const composerFocused = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadList = useCallback(async (opts: { cursor?: string | null; append?: boolean } = {}) => {
    if (opts.append) setLoadingMore(true); else setLoadingList(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      if (filter !== "all") params.set("filter", filter);
      if (opts.cursor) params.set("cursor", opts.cursor);
      const response = await authFetch(`/api/admin/whatsapp/conversations?${params}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to load WhatsApp inbox");
      setItems((prev) => opts.append ? [...prev, ...(body.conversations || [])] : (body.conversations || []));
      setNextCursor(body.nextCursor ?? null);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load inbox"); }
    finally { setLoadingList(false); setLoadingMore(false); }
  }, [search, filter]);

  const loadDetail = useCallback(async (id: string, quiet = false) => {
    if (!quiet) { setSelected(id); setError(null); }
    const container = threadRef.current;
    const atBottom = container ? container.scrollHeight - container.scrollTop - container.clientHeight < 60 : true;
    const priorTop = container?.scrollTop ?? 0;
    const response = await authFetch(`/api/admin/whatsapp/conversations/${id}`);
    const body = await response.json();
    if (!response.ok) { if (!quiet) setError(body.error || "Unable to load transcript"); return; }
    setDetail(body);
    // Opened / refreshed → the row's unread badge is now stale; drop it locally.
    setItems((prev) => prev.map((row) => row.conversation_id === id ? { ...row, unread_count: 0 } : row));
    requestAnimationFrame(() => {
      const el = threadRef.current;
      if (!el) return;
      if (atBottom) el.scrollTop = el.scrollHeight;
      else el.scrollTop = priorTop;
    });
  }, []);

  // Debounced list load on search / filter change.
  useEffect(() => { const t = window.setTimeout(() => void loadList(), 200); return () => window.clearTimeout(t); }, [loadList]);

  // Deep link from an admin handoff SMS/email: ?tab=whatsapp&conversation=<id>.
  useEffect(() => {
    if (!initialConversationId) return;
    const t = window.setTimeout(() => { void loadDetail(initialConversationId); setMobilePane("thread"); }, 0);
    return () => window.clearTimeout(t);
  }, [initialConversationId, loadDetail]);

  // Bounded polling. Drafts live in their own state so a refresh never clears
  // them; the thread scroll position is preserved in loadDetail.
  useEffect(() => {
    const t = window.setInterval(() => { if (!document.hidden) void loadList(); }, 20_000);
    return () => window.clearInterval(t);
  }, [loadList]);
  useEffect(() => {
    if (!selected) return;
    const t = window.setInterval(() => {
      if (!document.hidden && !composerFocused.current) void loadDetail(selected, true);
    }, 12_000);
    return () => window.clearInterval(t);
  }, [selected, loadDetail]);

  const conversation = detail?.conversation;
  const heldByOther = !!conversation?.assignedTo && conversation.assignedTo !== conversation.viewerId;
  const isSuper = conversation?.viewerRole === "super_admin";
  const iOwn = !!conversation && (!conversation.assignedTo || conversation.assignedTo === conversation.viewerId);
  const windowState = relativeWindow(conversation?.serviceWindowExpiresAt ?? null);

  async function patch(action: string, extra: Record<string, unknown> = {}) {
    if (!selected) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const response = await authFetch(`/api/admin/whatsapp/conversations/${selected}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const body = await response.json();
      if (response.status === 409 && body.conflict) { setError(body.error || "Another agent holds this conversation"); await loadDetail(selected, true); return; }
      if (!response.ok) { setError(body.error || "Unable to update conversation"); return; }
      setNotice("Updated.");
      setAssignTo("");
      await Promise.all([loadDetail(selected, true), loadList()]);
    } finally { setBusy(false); }
  }

  async function submit(type: "reply" | "note") {
    if (!selected) return;
    const content = type === "reply" ? reply : note;
    if (!content.trim()) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const payload: Record<string, unknown> = { type, body: content };
      if (type === "reply" && !windowState.open) payload.templateName = templateName.trim();
      const response = await authFetch(`/api/admin/whatsapp/conversations/${selected}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) { setError(body.error || `Unable to send ${type}`); return; }
      if (type === "reply") { setReply(""); setTemplateName(""); } else setNote("");
      await loadDetail(selected, true);
    } finally { setBusy(false); }
  }

  async function sendFile() {
    if (!selected || !pendingFile) return;
    setUploading(true); setError(null); setUploadMsg("Preparing upload…");
    try {
      // 1. Reserve a row + a single-path signed upload URL.
      const start = await authFetch(`/api/admin/whatsapp/conversations/${selected}/media`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: pendingFile.name, mimeType: pendingFile.type, byteSize: pendingFile.size }),
      });
      const startBody = await start.json();
      if (!start.ok) { setError(startBody.error || "Upload rejected"); return; }

      // 2. PUT the bytes straight to storage (never through our function).
      setUploadMsg("Uploading…");
      const put = await fetch(startBody.uploadUrl, { method: "PUT", headers: { "Content-Type": pendingFile.type }, body: pendingFile });
      if (!put.ok) { setError("The file upload failed. Try again."); return; }

      // 3. Server validates the stored bytes, checks the window, sends.
      setUploadMsg("Sending to customer…");
      const send = await authFetch(`/api/admin/whatsapp/conversations/${selected}/media`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaId: startBody.mediaId, caption: reply.trim() || undefined }),
      });
      const sendBody = await send.json();
      if (send.status === 409 && sendBody.blocked) { setError(sendBody.error); await loadDetail(selected, true); return; }
      if (!send.ok) { setError(sendBody.error || "The file could not be sent"); await loadDetail(selected, true); return; }
      setPendingFile(null); setReply(""); setUploadMsg(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadDetail(selected, true);
    } finally { setUploading(false); }
  }

  async function resendFile(mediaId: string) {
    if (!selected) return;
    setUploading(true); setError(null); setUploadMsg("Resending…");
    try {
      const send = await authFetch(`/api/admin/whatsapp/conversations/${selected}/media`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mediaId }),
      });
      const body = await send.json();
      if (send.status === 409 && body.blocked) { setError(body.error); }
      else if (!send.ok) { setError(body.error || "Resend failed"); }
      else setUploadMsg(null);
      await loadDetail(selected, true);
    } finally { setUploading(false); }
  }

  async function discardFile(mediaId: string) {
    if (!selected) return;
    await authFetch(`/api/admin/whatsapp/conversations/${selected}/media?mediaId=${encodeURIComponent(mediaId)}`, { method: "DELETE" });
    await loadDetail(selected, true);
  }

  async function reviewMedia(mediaId: string, patch: { linkedBookingId?: string; isPaymentProof?: boolean }) {
    if (!selected) return;
    setBusy(true); setError(null);
    try {
      const res = await authFetch(`/api/admin/whatsapp/conversations/${selected}/media`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaId, ...patch }),
      });
      const body = await res.json();
      if (!res.ok) setError(body.error || "Unable to update the attachment");
      await loadDetail(selected, true);
    } finally { setBusy(false); }
  }

  async function openMedia(mediaId: string) {
    if (!selected) return;
    const res = await authFetch(`/api/admin/whatsapp/conversations/${selected}/media?mediaId=${encodeURIComponent(mediaId)}`);
    if (!res.ok) { setError("Unable to open the file"); return; }
    const url = URL.createObjectURL(await res.blob());
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function openReceipt(paymentId: string) {
    if (!selected) return;
    const res = await authFetch(`/api/admin/whatsapp/conversations/${selected}/receipt?paymentId=${encodeURIComponent(paymentId)}`);
    if (!res.ok) { setError("Receipt is not available yet"); return; }
    const url = URL.createObjectURL(await res.blob());
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function resendReceipt(paymentId: string, channel: string) {
    if (!selected) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const res = await authFetch(`/api/admin/whatsapp/conversations/${selected}/receipt`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId, channel }),
      });
      const body = await res.json();
      if (!res.ok) { setError(body.error || "Resend failed"); }
      else setNotice(`Receipt ${body.outcome === "sent" ? "sent" : body.outcome}.`);
      await loadDetail(selected, true);
    } finally { setBusy(false); }
  }

  const openThread = (id: string) => { void loadDetail(id); setMobilePane("thread"); setPendingFile(null); setUploadMsg(null); };

  const unreadTotal = useMemo(() => items.reduce((sum, row) => sum + (row.unread_count || 0), 0), [items]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 lg:flex-row lg:items-center">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, phone, booking ID, message" className="input-field flex-1" />
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((value) => (
            <button key={value} onClick={() => setFilter(value)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${filter === value ? "bg-primary-700 text-white" : "bg-white text-gray-600 ring-1 ring-gray-200"}`}>
              {value}{value === "unread" && unreadTotal ? ` (${unreadTotal})` : ""}
            </button>
          ))}
        </div>
        <button onClick={() => void loadList()} className="rounded-xl bg-primary-700 px-4 py-2 text-sm font-semibold text-white">Refresh</button>
      </div>

      {error ? <div className="rounded-xl border border-danger/20 bg-danger/10 p-3 text-sm text-danger">{error}</div> : null}
      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div> : null}

      <div className="grid min-h-[640px] gap-4 lg:grid-cols-[320px_1fr_300px]">
        {/* List pane */}
        <aside className={`overflow-hidden rounded-2xl border border-gray-200 bg-white ${mobilePane === "thread" ? "hidden lg:block" : ""}`}>
          <div className="border-b border-gray-200 p-3 text-sm font-semibold text-gray-600">{loadingList ? "Loading…" : `${items.length} conversations`}</div>
          <div className="max-h-[600px] overflow-y-auto">
            {items.map((item) => {
              const contact = contactOf(item);
              return (
                <button key={item.conversation_id} onClick={() => openThread(item.conversation_id)}
                  className={`block w-full border-b border-gray-100 p-3 text-left hover:bg-gray-50 ${selected === item.conversation_id ? "bg-primary-50" : ""}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold text-gray-900">{contact.display_name || contact.wa_id || "WhatsApp customer"}</span>
                    <div className="flex shrink-0 items-center gap-1">
                      {item.unread_count > 0 ? <span className="rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-bold text-white">{item.unread_count}</span> : null}
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] uppercase text-gray-600">{item.status.replaceAll("_", " ")}</span>
                    </div>
                  </div>
                  <p className="mt-1 truncate text-xs text-gray-500">{item.preview || contact.wa_id}</p>
                  <p className="mt-1 flex items-center justify-between text-[11px] text-gray-400">
                    <span>{new Date(item.last_message_at).toLocaleString()}</span>
                    <span>{item.assigned_agent_name ? `@ ${item.assigned_agent_name}` : item.bookingId ? item.bookingId : ""}</span>
                  </p>
                </button>
              );
            })}
            {nextCursor ? (
              <button onClick={() => void loadList({ cursor: nextCursor, append: true })} disabled={loadingMore}
                className="w-full p-3 text-center text-xs font-semibold text-primary-700 hover:bg-gray-50 disabled:opacity-50">
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            ) : null}
          </div>
        </aside>

        {/* Thread pane */}
        <section className={`rounded-2xl border border-gray-200 bg-white ${mobilePane === "list" ? "hidden lg:block" : ""}`}>
          {!detail || !conversation ? (
            <div className="grid h-full place-items-center p-8 text-gray-500">Select a WhatsApp conversation.</div>
          ) : (
            <div className="flex h-full flex-col">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-4">
                <div className="min-w-0">
                  <button className="mb-1 text-xs font-semibold text-primary-700 lg:hidden" onClick={() => setMobilePane("list")}>← Inbox</button>
                  <p className="truncate font-semibold text-gray-900">{conversation.displayName || conversation.waId}</p>
                  <p className="text-xs text-gray-500">
                    {conversation.status.replaceAll("_", " ")} · mode {conversation.mode}
                    {conversation.assignedAgentName ? ` · held by ${conversation.assignedAgentName}` : ""}
                  </p>
                  <p className={`text-xs ${windowState.open ? "text-emerald-600" : "text-amber-600"}`}>{windowState.label}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <select value={assignTo} onChange={(e) => { setAssignTo(e.target.value); if (e.target.value) void patch("assign", { assigneeId: e.target.value }); }}
                    className="rounded-lg border px-2 py-2 text-xs" disabled={busy || (heldByOther && !isSuper)}>
                    <option value="">Assign agent…</option>
                    {detail.agents.map((a) => <option key={a.id} value={a.id}>{a.full_name || a.email || a.id}</option>)}
                  </select>
                  {heldByOther && conversation.status === "human_controlled" ? (
                    <button onClick={() => void patch("takeover", isSuper ? { force: true } : {})} disabled={busy || !isSuper}
                      className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 disabled:opacity-50">
                      {isSuper ? "Take over anyway" : `Held by ${conversation.assignedAgentName || "agent"}`}
                    </button>
                  ) : (
                    <button onClick={() => void patch("takeover")} disabled={busy}
                      className="rounded-lg bg-primary-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Take over</button>
                  )}
                  <button onClick={() => void patch("resolve")} disabled={busy || (heldByOther && !isSuper)}
                    className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">Resolve</button>
                  <button onClick={() => void patch("bot")} disabled={busy || (heldByOther && !isSuper)}
                    className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">Return to bot</button>
                  <button onClick={() => setDetailsOpen((v) => !v)} className="rounded-lg border px-3 py-2 text-xs font-semibold lg:inline hidden">
                    {detailsOpen ? "Hide details" : "Details"}
                  </button>
                </div>
              </div>

              <div ref={threadRef} className="max-h-[420px] flex-1 space-y-3 overflow-y-auto p-4">
                {detail.messages.map((message) => (
                  <div key={message.id} className={`max-w-[80%] rounded-2xl p-3 text-sm ${KIND_STYLE[message.kind]}`}>
                    <p className="mb-1 text-[10px] font-semibold uppercase opacity-70">
                      {KIND_LABEL[message.kind]}{message.senderName ? ` · ${message.senderName}` : ""}{message.templateName ? ` · template ${message.templateName}` : ""}
                    </p>
                    <p className="whitespace-pre-wrap">{message.body}</p>
                    {(message.attachments as Array<Record<string, unknown>>).map((att, i) => (
                      <button key={i}
                        onClick={() => void (att.receiptFor ? openReceipt(String(att.receiptFor)) : openMedia(String(att.mediaId)))}
                        className="mt-2 flex items-center gap-2 rounded-lg bg-white/15 px-2 py-1 text-xs underline">
                        {att.receiptFor ? "🧾" : "📎"} {String(att.fileName || "attachment")}{att.byteSize ? ` · ${humanSize(Number(att.byteSize))}` : ""}
                      </button>
                    ))}
                    <p className="mt-1 text-[10px] opacity-70">
                      {new Date(message.createdAt).toLocaleString()}
                      {message.deliveryStatus ? ` · ${message.deliveryStatus}` : ""}
                      {message.errorCode ? ` · error ${message.errorCode}` : ""}
                    </p>
                  </div>
                ))}
                {!detail.messages.length ? <p className="text-sm text-gray-400">No messages yet.</p> : null}
              </div>

              <div className="space-y-3 border-t border-gray-200 p-4">
                {conversation.mode !== "human" ? (
                  <p className="text-xs text-gray-500">Take over the conversation to reply. The bot is handling it now.</p>
                ) : !iOwn ? (
                  <p className="text-xs text-amber-600">Another agent holds this conversation — you cannot reply until it is reassigned.</p>
                ) : (
                  <>
                    {!windowState.open ? (
                      <input value={templateName} onChange={(e) => setTemplateName(e.target.value)}
                        placeholder="Approved template name (required — window closed)" className="input-field w-full text-sm" />
                    ) : null}
                    <div className="flex gap-2">
                      <textarea value={reply} onChange={(e) => setReply(e.target.value)}
                        onFocus={() => { composerFocused.current = true; }} onBlur={() => { composerFocused.current = false; }}
                        placeholder={windowState.open ? "Reply to customer (also used as the file caption)" : "Template body parameter"}
                        className="input-field min-h-20 flex-1 text-sm" />
                      <button onClick={() => void submit("reply")} disabled={busy || !reply.trim()}
                        className="rounded-xl bg-primary-700 px-4 font-semibold text-white disabled:opacity-50">Send</button>
                    </div>
                    {windowState.open ? (
                      <div className="rounded-xl border border-gray-200 p-2 text-xs">
                        <input ref={fileInputRef} type="file" accept={ACCEPTED_FILE_TYPES} className="hidden"
                          onChange={(e) => { const f = e.target.files?.[0] || null; setPendingFile(f); setUploadMsg(null); }} />
                        {!pendingFile ? (
                          <button onClick={() => fileInputRef.current?.click()} className="font-semibold text-primary-700">
                            📎 Attach a document or image (PDF, JPEG, PNG)
                          </button>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-gray-800">{pendingFile.name}</span>
                            <span className="text-gray-500">{humanSize(pendingFile.size)}</span>
                            <button onClick={() => { setPendingFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                              disabled={uploading} className="text-danger disabled:opacity-50">remove</button>
                            <button onClick={() => void sendFile()} disabled={uploading}
                              className="rounded-lg bg-primary-700 px-3 py-1 font-semibold text-white disabled:opacity-50">
                              {uploading ? "Working…" : "Send file"}
                            </button>
                          </div>
                        )}
                        {uploadMsg ? <p className="mt-1 text-gray-500">{uploadMsg}</p> : null}
                      </div>
                    ) : (
                      <p className="text-xs text-amber-600">Files can only be sent while the 24-hour window is open.</p>
                    )}
                  </>
                )}
                <div className="flex gap-2">
                  <input value={note} onChange={(e) => setNote(e.target.value)}
                    onFocus={() => { composerFocused.current = true; }} onBlur={() => { composerFocused.current = false; }}
                    placeholder="Internal note (never sent to the customer)" className="input-field flex-1 text-sm" />
                  <button onClick={() => void submit("note")} disabled={busy || !note.trim()}
                    className="rounded-xl border px-4 font-semibold disabled:opacity-50">Add note</button>
                </div>
                {detail.notes.length ? (
                  <div className="space-y-1 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
                    {detail.notes.map((entry) => (
                      <p key={entry.id}><span className="font-semibold">{entry.authorName || "Agent"}:</span> {entry.body} <span className="opacity-60">— {when(entry.created_at)}</span></p>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </section>

        {/* Details pane */}
        <aside className={`space-y-3 overflow-y-auto rounded-2xl border border-gray-200 bg-white p-4 lg:max-h-[640px] ${detailsOpen ? (mobilePane === "thread" ? "block lg:block" : "hidden lg:block") : "hidden"}`}>
          {!detail ? <p className="text-sm text-gray-400">Conversation details appear here.</p> : (
            <>
              <div>
                <h3 className="text-sm font-semibold text-gray-800">Customer</h3>
                <p className="text-xs text-gray-600">{detail.conversation.displayName || "—"}</p>
                <p className="text-xs text-gray-600">{detail.conversation.waId}</p>
                <p className="text-xs text-gray-500">Language {detail.conversation.language} · consent {detail.conversation.consentStatus || "implicit"}</p>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-800">Bookings</h3>
                {!detail.bookings.length ? <p className="text-xs text-gray-400">No bookings owned by this WhatsApp account.</p> : detail.bookings.map((b) => (
                  <div key={b.bookingId} className="mt-2 rounded-xl border border-gray-200 p-3 text-xs">
                    <p className="font-semibold text-gray-900">{b.bookingId} <span className="font-normal text-gray-500">· {b.status}</span></p>
                    <p className="text-gray-600">{b.route} · requested {b.requestedDate || "—"}</p>
                    <p className="text-gray-600">Passenger: {b.passengerName || "—"}</p>
                    <p className="text-gray-600">Booker: {b.bookerPhone}{b.email ? ` · ${b.email}` : ""}</p>
                    <p className={b.transportAssigned ? "text-emerald-700" : "text-amber-700"}>
                      {b.transportAssigned ? `Transport assigned${b.assignedAt ? ` ${new Date(b.assignedAt).toLocaleDateString()}` : ""}` : "Transport not assigned yet"}
                    </p>
                    <p className="mt-1 text-gray-700">Booking fee: <span className="font-semibold">{b.bookingFeeStatus}</span> ({money(b.bookingFeeAmount)})</p>
                    <p className="text-gray-700">Fare: <span className="font-semibold">{b.fareStatus}</span> ({money(b.fareAmount)})</p>
                    {b.outstanding > 0 ? <p className="text-gray-700">Outstanding: <span className="font-semibold">{money(b.outstanding)}</span></p> : null}
                    {b.deadline ? <p className="text-amber-700">Fee deadline: {when(b.deadline)}</p> : null}
                  </div>
                ))}
                {detail.phoneMatchBookings.length ? (
                  <details className="mt-2 rounded-xl border border-dashed border-gray-300 p-2 text-xs">
                    <summary className="cursor-pointer text-gray-500">
                      {detail.phoneMatchBookings.length} other booking{detail.phoneMatchBookings.length === 1 ? "" : "s"} on this phone number — not verified as this WhatsApp account
                    </summary>
                    {detail.phoneMatchBookings.map((b) => (
                      <p key={b.bookingId} className="mt-1 text-gray-500">
                        {b.bookingId} · {b.route} · {b.requestedDate || "—"} · {b.status} · {b.source}
                      </p>
                    ))}
                  </details>
                ) : null}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-800">Payments</h3>
                {!detail.payments.length ? <p className="text-xs text-gray-400">No payment records.</p> : detail.payments.map((p, i) => (
                  <p key={`${p.booking_id}-${i}`} className="mt-1 text-xs text-gray-600">
                    {p.booking_id} · {p.payment_type} · <span className="font-semibold">{p.status}</span> · {money(Number(p.expected_amount) || 0, p.currency || "MWK")}
                    {p.paid_at ? ` · paid ${new Date(p.paid_at).toLocaleDateString()}` : ""}
                  </p>
                ))}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-800">Receipts</h3>
                {!detail.receipts.length ? <p className="text-xs text-gray-400">No receipt deliveries yet.</p> : detail.receipts.map((r) => (
                  <div key={`${r.paymentId}-${r.channel}`} className="mt-2 rounded-xl border border-gray-200 p-2 text-xs">
                    <p className="font-semibold text-gray-900">
                      {r.paymentType === "booking_fee" ? "Booking-fee receipt" : r.paymentType === "transport_fare" ? "Fare receipt" : "Receipt"}
                      <span className="font-normal text-gray-500"> · {r.channel}</span>
                    </p>
                    <p className={r.status === "sent" ? "text-emerald-700" : r.status === "failed" || r.status === "blocked" ? "text-danger" : "text-gray-500"}>
                      {r.status}{r.errorMessage ? ` · ${r.errorMessage}` : ""}{r.attempts ? ` · ${r.attempts} attempt${r.attempts === 1 ? "" : "s"}` : ""}
                      {r.sentAt ? ` · ${new Date(r.sentAt).toLocaleString()}` : ""}
                    </p>
                    <div className="mt-1 flex gap-3">
                      <button onClick={() => void openReceipt(r.paymentId)} className="font-semibold text-primary-700">Open PDF</button>
                      {r.channel === "whatsapp" && r.status !== "sending" ? (
                        <button onClick={() => void resendReceipt(r.paymentId, "whatsapp")} disabled={busy} className="font-semibold text-primary-700 disabled:opacity-50">
                          {r.status === "sent" ? "Resend" : "Retry"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-800">Files received</h3>
                {!detail.media.some((m) => m.direction === "inbound") ? (
                  <p className="text-xs text-gray-400">No files received from this customer.</p>
                ) : detail.media.filter((m) => m.direction === "inbound").map((m) => (
                  <div key={m.id} className="mt-2 rounded-xl border border-gray-200 p-2 text-xs">
                    <p className="font-semibold text-gray-900">
                      {m.kind === "document" ? "📄" : "🖼"} {m.fileName}
                      {m.isPaymentProof ? <span className="ml-1 rounded bg-emerald-100 px-1 text-[10px] text-emerald-800">payment proof</span> : null}
                    </p>
                    <p className="text-gray-500">{humanSize(m.byteSize)} · {new Date(m.createdAt).toLocaleString()}</p>
                    {m.caption ? <p className="text-gray-600">“{m.caption}”</p> : null}
                    <p className={m.status === "stored" ? "text-emerald-700" : m.status === "quarantined" || m.status === "failed" ? "text-danger" : "text-gray-500"}>
                      {m.status}{m.errorCode ? ` · ${m.errorCode}` : ""}
                    </p>
                    {m.status === "stored" ? (
                      <div className="mt-1 space-y-1">
                        <button onClick={() => void openMedia(m.id)} className="font-semibold text-primary-700">Open</button>
                        <div className="flex flex-wrap items-center gap-2">
                          <select value={m.linkedBookingId || ""} disabled={busy}
                            onChange={(e) => void reviewMedia(m.id, { linkedBookingId: e.target.value })}
                            className="rounded border px-1 py-0.5 text-[11px]">
                            <option value="">Link to booking…</option>
                            {detail.bookings.map((b) => <option key={b.bookingId} value={b.bookingId}>{b.bookingId}</option>)}
                          </select>
                          <label className="flex items-center gap-1 text-[11px]">
                            <input type="checkbox" checked={m.isPaymentProof} disabled={busy}
                              onChange={(e) => void reviewMedia(m.id, { isPaymentProof: e.target.checked })} />
                            payment proof
                          </label>
                        </div>
                        {m.reviewedByName ? <p className="text-[11px] text-gray-400">reviewed by {m.reviewedByName}</p> : null}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-800">Files sent</h3>
                {!detail.media.some((m) => m.direction === "outbound") ? <p className="text-xs text-gray-400">No files sent.</p> : detail.media.filter((m) => m.direction === "outbound").map((m) => (
                  <div key={m.id} className="mt-2 rounded-xl border border-gray-200 p-2 text-xs">
                    <p className="font-semibold text-gray-900">{m.kind === "document" ? "📄" : "🖼"} {m.fileName}</p>
                    <p className="text-gray-500">{humanSize(m.byteSize)} · {new Date(m.createdAt).toLocaleString()}{m.uploadedByName ? ` · ${m.uploadedByName}` : ""}</p>
                    <p className={m.status === "sent" ? "text-emerald-700" : m.status === "failed" || m.status === "blocked" ? "text-danger" : "text-gray-500"}>
                      {m.status}{m.errorCode ? ` · ${m.errorCode}` : ""}
                    </p>
                    <div className="mt-1 flex gap-3">
                      <button onClick={() => void openMedia(m.id)} className="font-semibold text-primary-700">Open</button>
                      {(m.status === "failed" || m.status === "blocked") && iOwn ? (
                        <button onClick={() => void resendFile(m.id)} disabled={uploading} className="font-semibold text-primary-700 disabled:opacity-50">Resend</button>
                      ) : null}
                      {m.status !== "sent" && m.status !== "sending" && iOwn ? (
                        <button onClick={() => void discardFile(m.id)} disabled={uploading} className="text-danger disabled:opacity-50">Discard</button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
