import { CheckCircle2, XCircle, Clock, CalendarCheck2, type LucideIcon } from "lucide-react";

// A status pill is never color alone — every state pairs a distinct icon with
// its label so it doesn't rely on color perception to read correctly.
const STATUS_CONFIG: Record<string, { icon: LucideIcon; classes: string }> = {
  completed: { icon: CheckCircle2, classes: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  cancelled: { icon: XCircle, classes: "bg-red-50 text-red-700 border-red-200" },
  boarding: { icon: Clock, classes: "bg-amber-50 text-amber-700 border-amber-200" },
  departed: { icon: Clock, classes: "bg-amber-50 text-amber-700 border-amber-200" },
  arrived: { icon: Clock, classes: "bg-amber-50 text-amber-700 border-amber-200" },
};

const DEFAULT_STATUS = { icon: CalendarCheck2, classes: "bg-blue-50 text-blue-700 border-blue-200" };

export default function StatusBadge({ status, size = "md" }: { status?: string; size?: "sm" | "md" }) {
  const normalized = (status || "").toLowerCase();
  const { icon: Icon, classes } = STATUS_CONFIG[normalized] || DEFAULT_STATUS;
  const isSmall = size === "sm";

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border font-bold ${classes} ${
        isSmall ? "px-2.5 py-1 text-[11px]" : "px-3.5 py-1.5 text-xs"
      }`}
    >
      <Icon size={isSmall ? 11 : 13} strokeWidth={2.5} />
      {status || "Unknown"}
    </span>
  );
}
