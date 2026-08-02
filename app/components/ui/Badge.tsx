import type { ReactNode } from "react";

export type BadgeTone = "success" | "info" | "warning" | "danger" | "neutral";

const TONE_CLASS: Record<BadgeTone, string> = {
  success: "badge-success",
  info: "badge-info",
  warning: "badge-warning",
  danger: "badge-danger",
  neutral: "badge-neutral",
};

type BadgeProps = {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
};

/**
 * The one status-pill component for the app. See lib/statusTones.ts for
 * the domain-specific status -> tone mapping functions (application,
 * ambassador, commission, ticket, payment) that previously existed as 5
 * separate hand-rolled color maps across different pages.
 */
export default function Badge({ tone = "neutral", children, className = "" }: BadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${TONE_CLASS[tone]} ${className}`.trim()}>
      {children}
    </span>
  );
}
