"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/auth";
import PageHeader from "@/app/components/ui/PageHeader";
import Badge from "@/app/components/ui/Badge";
import DataTable, { type DataTableColumn } from "@/app/components/ui/DataTable";
import { commissionStatusTone } from "@/lib/statusTones";

type CustomerRow = Record<string, unknown>;

export default function AmbassadorCustomersPage() {
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await authFetch("/api/referrals", { method: "GET" });
        if (!res.ok) return;
        const data = await res.json();
        setRows(Array.isArray(data?.referrals) ? data.referrals : []);
      } catch (error) {
        console.error("Failed to load ambassador customers", error);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const columns: DataTableColumn<CustomerRow>[] = [
    { key: "student", label: "Student", render: (row) => <span className="font-semibold text-gray-800">{String(row.customer_name || "—")}</span> },
    { key: "phone", label: "Phone", render: (row) => String(row.customer_phone || "—") },
    { key: "route", label: "Route", render: (row) => String(row.route || "—") },
    { key: "travelDate", label: "Travel date", render: (row) => String(row.travel_date || "—") },
    {
      key: "status",
      label: "Booking status",
      render: (row) => {
        const status = String(row.commission_status || row.status || "pending");
        return <Badge tone={commissionStatusTone(status)}>{status}</Badge>;
      },
    },
    { key: "commission", label: "Commission", render: (row) => `MWK ${Number(row.commission_amount || 0).toLocaleString()}` },
  ];

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="My customers" title="Customers linked to your referral code" />
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(row) => String(row.id)}
        loading={loading}
        loadingLabel="Loading your customers…"
        emptyTitle="No customers yet"
        emptyDescription="Customers who book with your referral code will show up here."
      />
    </div>
  );
}
