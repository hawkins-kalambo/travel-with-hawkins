"use client";

import { useState } from "react";
import Button from "./Button";
import { IconX } from "@/app/components/Icon";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  reasonMinLength?: number;
  onConfirm: (reason?: string) => void | Promise<void>;
  onCancel: () => void;
};

/**
 * Replaces raw browser confirm()/window.prompt() dialogs (previously used
 * for application approve/reject, ambassador password reset, and
 * announcement deletion) with a real, on-brand, non-blocking modal.
 * Supports both a plain confirm and a confirm-with-required-reason variant
 * (e.g. rejection reason) in one component.
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  requireReason = false,
  reasonLabel = "Reason",
  reasonPlaceholder = "",
  reasonMinLength = 5,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setReason("");
      setSubmitting(false);
      setTouched(false);
    }
  }

  if (!open) return null;

  const reasonTooShort = requireReason && reason.trim().length < reasonMinLength;

  const handleConfirm = async () => {
    setTouched(true);
    if (reasonTooShort) return;
    setSubmitting(true);
    try {
      await onConfirm(requireReason ? reason.trim() : undefined);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-gray-900/50 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <h2 id="confirm-dialog-title" className="text-lg font-bold text-gray-800">
            {title}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="shrink-0 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <IconX className="h-5 w-5" />
          </button>
        </div>

        {description && <p className="mt-2 text-sm text-gray-600">{description}</p>}

        {requireReason && (
          <div className="mt-4">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{reasonLabel}</label>
            <textarea
              className="input-field"
              rows={3}
              value={reason}
              placeholder={reasonPlaceholder}
              onChange={(event) => setReason(event.target.value)}
              autoFocus
            />
            {touched && reasonTooShort && (
              <p className="mt-1 text-xs font-medium text-danger">Please provide at least {reasonMinLength} characters.</p>
            )}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="muted" onClick={onCancel} disabled={submitting}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? "danger-solid" : "primary"} onClick={() => void handleConfirm()} disabled={submitting}>
            {submitting ? "Please wait…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
