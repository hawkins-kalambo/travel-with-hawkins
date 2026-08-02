import type { ReactNode } from "react";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
};

/**
 * The repeated "title + description + action buttons" header card seen at
 * the top of nearly every ambassador/admin page, each previously
 * hand-rolled slightly differently.
 */
export default function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
      <div>
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary-700">{eyebrow}</p>}
        <h1 className="mt-1 text-2xl font-black text-gray-800">{title}</h1>
        {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
