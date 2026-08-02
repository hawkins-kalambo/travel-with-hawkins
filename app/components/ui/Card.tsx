import type { ReactNode } from "react";

type CardProps = {
  children: ReactNode;
  className?: string;
  padding?: "none" | "sm" | "md" | "lg";
};

const PADDING_CLASS: Record<NonNullable<CardProps["padding"]>, string> = {
  none: "",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

/**
 * The one consistent "card" container for ambassador/admin/communications
 * pages. Replaces the ~6 different ad hoc card variants
 * (rounded-2xl/rounded-3xl/rounded-[24px]/rounded-[28px] etc.) found
 * scattered across those pages.
 */
export default function Card({ children, className = "", padding = "md" }: CardProps) {
  return <div className={`rounded-2xl border border-gray-200 bg-white shadow-sm ${PADDING_CLASS[padding]} ${className}`.trim()}>{children}</div>;
}
