import type { ReactNode } from "react";

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

/**
 * Replaces the many one-off "No X yet." plain-text placeholders scattered
 * across ambassador/admin pages with one consistent empty-state pattern.
 */
export default function EmptyState({ icon, title, description, action, className = "" }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-200 bg-gray-100/60 px-6 py-10 text-center ${className}`.trim()}>
      {icon && <div className="text-gray-400">{icon}</div>}
      <p className="font-semibold text-gray-700">{title}</p>
      {description && <p className="max-w-sm text-sm text-gray-500">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
