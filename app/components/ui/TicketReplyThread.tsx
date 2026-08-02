import Button from "./Button";
import Spinner from "./Spinner";
import type { TicketReply } from "@/lib/hooks/useTicketReplies";

type TicketReplyThreadProps = {
  replies: TicketReply[];
  loading: boolean;
  replyBody: string;
  onReplyBodyChange: (value: string) => void;
  onSend: () => void;
  sending: boolean;
  error?: string | null;
  emptyLabel?: string;
};

/** Paired with lib/hooks/useTicketReplies.ts — the shared reply-thread UI. */
export default function TicketReplyThread({
  replies,
  loading,
  replyBody,
  onReplyBodyChange,
  onSend,
  sending,
  error,
  emptyLabel = "No replies yet.",
}: TicketReplyThreadProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      {loading ? (
        <div className="py-2">
          <Spinner size="sm" label="Loading replies…" />
        </div>
      ) : replies.length === 0 ? (
        <p className="text-xs text-gray-500">{emptyLabel}</p>
      ) : (
        <ul className="space-y-2">
          {replies.map((reply) => (
            <li key={reply.id} className="rounded-lg bg-gray-100 p-2 text-sm">
              <p className="font-semibold text-gray-800">{reply.profiles?.full_name || reply.profiles?.email || "User"}</p>
              <p className="text-gray-600">{reply.body}</p>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-2 text-xs font-medium text-danger">{error}</p>}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <textarea
          value={replyBody}
          onChange={(event) => onReplyBodyChange(event.target.value)}
          placeholder="Write a reply…"
          rows={2}
          className="input-field flex-1 text-sm"
        />
        <Button variant="primary" onClick={onSend} disabled={sending || !replyBody.trim()}>
          {sending ? "Sending…" : "Reply"}
        </Button>
      </div>
    </div>
  );
}
