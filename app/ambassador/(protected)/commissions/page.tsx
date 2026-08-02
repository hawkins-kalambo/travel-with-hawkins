"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/auth";
import PageHeader from "@/app/components/ui/PageHeader";
import Badge from "@/app/components/ui/Badge";
import DataTable, { type DataTableColumn } from "@/app/components/ui/DataTable";
import { commissionStatusTone } from "@/lib/statusTones";

type CommissionRow = Record<string, unknown>;

export default function AmbassadorCommissionsPage() {
  const [rows, setRows] = useState<CommissionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadCommissions = async () => {
      try {
        const res = await authFetch("/api/referrals", { method: "GET" });
        if (!res.ok) return;
        const data = await res.json();
        setRows(Array.isArray(data?.referrals) ? data.referrals : []);
      } catch (error) {
        console.error("Failed to load commissions", error);
      } finally {
        setLoading(false);
      }
    };

    void loadCommissions();
  }, []);

  const columns: DataTableColumn<CommissionRow>[] = [
    { key: "customer", label: "Booking", render: (row) => <span className="font-semibold text-gray-800">{String(row.customer_name || "—")}</span> },
    { key: "date", label: "Date", render: (row) => String(row.created_at || "—").slice(0, 10) },
    { key: "route", label: "Route", render: (row) => String(row.route || "—") },
    { key: "commission", label: "Commission", render: (row) => `MWK ${Number(row.commission_amount || 0).toLocaleString()}` },
    {
      key: "status",
      label: "Status",
      render: (row) => {
        const status = String(row.commission_status || row.status || "pending");
        return <Badge tone={commissionStatusTone(status)}>{status}</Badge>;
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Commission Dashboard" title="Your commission activity" />
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(row) => String(row.id)}
        loading={loading}
        loadingLabel="Loading commissions…"
        emptyTitle="No commission data yet"
        emptyDescription="Commissions from your referred bookings will show up here."
      />
    </div>
  );
}
