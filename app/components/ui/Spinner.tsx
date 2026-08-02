type SpinnerProps = {
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string;
};

const SIZE_CLASS: Record<NonNullable<SpinnerProps["size"]>, string> = {
  sm: "h-4 w-4 border-2",
  md: "h-6 w-6 border-2",
  lg: "h-10 w-10 border-[3px]",
};

/**
 * A real loading spinner, replacing the plain "Loading…" text every
 * ambassador/admin page previously used with nothing else. Uses
 * currentColor for its ring, with no default color of its own — it
 * inherits whatever text color the parent/className sets (e.g. wrap in
 * `text-primary-700` on a white card, or `text-white` inside a solid
 * primary-colored button). Deliberately doesn't set a default color class
 * on this element, since Tailwind utility classes on the same element
 * don't reliably override by className string order without tailwind-merge.
 */
export default function Spinner({ size = "md", className = "", label }: SpinnerProps) {
  return (
    <span role="status" className={`inline-flex items-center gap-2 ${className}`.trim()}>
      <span className={`${SIZE_CLASS[size]} animate-spin rounded-full border-current/25 border-t-current`} />
      {label && <span className="text-sm text-gray-500">{label}</span>}
      <span className="sr-only">{label || "Loading"}</span>
    </span>
  );
}

/** Convenience full-block loading state for pages/tables/cards. */
export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-[160px] flex-col items-center justify-center gap-3 text-sm text-gray-500">
      <Spinner size="lg" className="text-primary-700" />
      <span>{label}</span>
    </div>
  );
}
