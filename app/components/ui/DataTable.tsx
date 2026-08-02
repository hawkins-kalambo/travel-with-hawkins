import type { ReactNode } from "react";
import Card from "./Card";
import { LoadingState } from "./Spinner";
import EmptyState from "./EmptyState";

export type DataTableColumn<T> = {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  className?: string;
};

type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  loading?: boolean;
  loadingLabel?: string;
  emptyTitle?: string;
  emptyDescription?: string;
};

/**
 * The mobile-responsiveness fix: every data table across ambassador/admin
 * pages previously just horizontally scrolled on small screens
 * (overflow-x-auto + min-w-full) with no real mobile layout. Renders a
 * normal <table> at md: and above, and the same rows as stacked
 * label/value cards below md — both views come from the same `columns`
 * definition, so they can't drift apart.
 */
export default function DataTable<T>({
  columns,
  rows,
  getRowKey,
  loading = false,
  loadingLabel = "Loading…",
  emptyTitle = "Nothing here yet",
  emptyDescription,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <Card>
        <LoadingState label={loadingLabel} />
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState title={emptyTitle} description={emptyDescription} />
      </Card>
    );
  }

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-100 text-gray-600">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={`px-4 py-3 font-semibold ${column.className ?? ""}`.trim()}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={getRowKey(row)} className="border-b border-gray-100 last:border-b-0">
                {columns.map((column) => (
                  <td key={column.key} className={`px-4 py-3 align-top text-gray-700 ${column.className ?? ""}`.trim()}>
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-gray-100 md:hidden">
        {rows.map((row) => (
          <div key={getRowKey(row)} className="space-y-2 p-4">
            {columns.map((column) => (
              <div key={column.key} className="flex items-start justify-between gap-3 text-sm">
                <span className="shrink-0 font-semibold text-gray-500">{column.label}</span>
                <span className="text-right text-gray-700">{column.render(row)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Card>
  );
}
