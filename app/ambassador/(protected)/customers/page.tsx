"use client";

import { useEffect, useMemo, useState } from "react";
import { authFetch } from "@/lib/auth";
import PageHeader from "@/app/components/ui/PageHeader";
import Badge from "@/app/components/ui/Badge";
import DataTable, { type DataTableColumn } from "@/app/components/ui/DataTable";
import { commissionStatusTone, bookingPaymentStatus, type BookingPaymentSummary } from "@/lib/statusTones";

type CustomerRow = Record<string, unknown>;

export default function AmbassadorCustomersPage() {
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

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

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const customerName = String(row.customer_name || "").toLowerCase();
      const phone = String(row.customer_phone || "").toLowerCase();
      const route = String(row.route || "").toLowerCase();
      return customerName.includes(q) || phone.includes(q) || route.includes(q);
    });
  }, [rows, search]);

  const columns: DataTableColumn<CustomerRow>[] = [
    { key: "student", label: "Student", render: (row) => <span className="font-semibold text-gray-800">{String(row.customer_name || "—")}</span> },
    { key: "phone", label: "Phone", render: (row) => String(row.customer_phone || "—") },
    { key: "route", label: "Route", render: (row) => String(row.route || "—") },
    { key: "travelDate", label: "Travel date", render: (row) => String(row.travel_date || "—") },
    {
      key: "status",
      label: "Commission status",
      render: (row) => {
        const status = String(row.commission_status || row.status || "pending");
        return <Badge tone={commissionStatusTone(status)}>{status}</Badge>;
      },
    },
    {
      key: "payment",
      label: "Payment status",
      render: (row) => {
        // Whether the STUDENT has paid Travel with Hawkins -- separate from
        // (and shown alongside) your own commission payout status above.
        // Reflects admin-confirmed cash fare payments too, not just online
        // ones (see lib/bookingPaymentStatus.ts / fare_status).
        const summary = row.booking_payment_status as BookingPaymentSummary | null | undefined;
        const { label, tone } = bookingPaymentStatus(summary);
        return <Badge tone={tone}>{label}</Badge>;
      },
    },
    { key: "commission", label: "Commission", render: (row) => `MWK ${Number(row.commission_amount || 0).toLocaleString()}` },
  ];

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="My customers" title="Customers linked to your referral code" />
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search by student name, phone or route"
        className="input-field"
      />
      <DataTable
        columns={columns}
        rows={filteredRows}
        getRowKey={(row) => String(row.id)}
        loading={loading}
        loadingLabel="Loading your customers…"
        emptyTitle="No customers yet"
        emptyDescription="Customers who book with your referral code will show up here."
      />
    </div>
  );
}
