"use client";

import { useCallback, useState } from "react";
import { authFetch } from "@/lib/auth";

// Extracted so the ticket-reply expand/load/send logic isn't duplicated
// between app/ambassador/(protected)/communication/page.tsx and
// app/admin/communication/support-tickets.tsx, which previously had two
// independent copies of the same expand-toggle/load/send flow.

export type TicketReply = {
  id: string;
  author_id: string;
  body: string;
  created_at?: string;
  profiles?: { full_name?: string; email?: string } | null;
};

export function useTicketReplies() {
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);
  const [replies, setReplies] = useState<TicketReply[]>([]);
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  const loadReplies = useCallback(async (ticketId: string) => {
    setRepliesLoading(true);
    try {
      const res = await authFetch(`/api/communication/tickets/${ticketId}/replies`);
      const data = await res.json();
      setReplies(res.ok && data?.success && Array.isArray(data.replies) ? data.replies : []);
    } catch {
      setReplies([]);
    } finally {
      setRepliesLoading(false);
    }
  }, []);

  const toggleTicket = useCallback(
    (ticketId: string) => {
      setExpandedTicketId((current) => {
        if (current === ticketId) {
          setReplies([]);
          return null;
        }
        setReplyBody("");
        setReplyError(null);
        void loadReplies(ticketId);
        return ticketId;
      });
    },
    [loadReplies]
  );

  const sendReply = useCallback(
    async (ticketId: string) => {
      if (!replyBody.trim()) return;
      setSendingReply(true);
      setReplyError(null);
      try {
        const res = await authFetch(`/api/communication/tickets/${ticketId}/replies`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: replyBody.trim() }),
        });
        const data = await res.json();
        if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to send reply");
        setReplyBody("");
        await loadReplies(ticketId);
      } catch (err) {
        setReplyError(err instanceof Error ? err.message : "Failed to send reply");
      } finally {
        setSendingReply(false);
      }
    },
    [replyBody, loadReplies]
  );

  return {
    expandedTicketId,
    replies,
    repliesLoading,
    replyBody,
    setReplyBody,
    sendingReply,
    replyError,
    toggleTicket,
    sendReply,
  };
}
