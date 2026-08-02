"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { authFetch, supabase } from "@/lib/auth";
import PageHeader from "@/app/components/ui/PageHeader";
import Badge from "@/app/components/ui/Badge";
import DataTable, { type DataTableColumn } from "@/app/components/ui/DataTable";
import { commissionStatusTone, bookingPaymentStatus, type BookingPaymentSummary } from "@/lib/statusTones";

type ReferralRow = Record<string, unknown>;

export default function AdminReferralBookingsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<ReferralRow[]>([]);
  const [ambassadors, setAmbassadors] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [ambassadorFilter, setAmbassadorFilter] = useState("all");
  const [routeFilter, setRouteFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    const load = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push("/admin/login");
      }

      try {
        const [referralsRes, ambassadorsRes] = await Promise.all([
          authFetch("/api/referrals", { method: "GET" }),
          authFetch("/api/ambassadors", { method: "GET" }),
        ]);

        if (referralsRes.ok) {
          const referralsData = await referralsRes.json();
          setRows(Array.isArray(referralsData?.referrals) ? referralsData.referrals : []);
        }

        if (ambassadorsRes.ok) {
          const ambassadorsData = await ambassadorsRes.json();
          setAmbassadors(Array.isArray(ambassadorsData?.ambassadors) ? ambassadorsData.ambassadors : []);
        }
      } catch (error) {
        console.error("Failed to load referral bookings", error);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [router]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const customerName = String(row.customer_name || "").toLowerCase();
      const phone = String(row.customer_phone || "").toLowerCase();
      const route = String(row.route || "").toLowerCase();
      const ambassadorId = String(row.ambassador_id || "");
      const bookingStatus = String(row.commission_status || row.status || "pending").toLowerCase();
      const date = String(row.created_at || "").slice(0, 10);
      const matchesSearch = !q || customerName.includes(q) || phone.includes(q);
      const matchesAmbassador = ambassadorFilter === "all" || ambassadorId === ambassadorFilter;
      const matchesRoute = routeFilter === "all" || route === routeFilter.toLowerCase();
      const matchesDate = !dateFilter || date === dateFilter;
      const matchesStatus = statusFilter === "all" || bookingStatus === statusFilter;
      return matchesSearch && matchesAmbassador && matchesRoute && matchesDate && matchesStatus;
    });
  }, [rows, search, ambassadorFilter, routeFilter, dateFilter, statusFilter]);

  const columns: DataTableColumn<ReferralRow>[] = [
    { key: "bookingId", label: "Booking ID", render: (row) => <span className="font-semibold text-gray-800">{String(row.booking_id || "—")}</span> },
    { key: "student", label: "Student", render: (row) => String(row.customer_name || "—") },
    { key: "phone", label: "Phone", render: (row) => String(row.customer_phone || "—") },
    { key: "route", label: "Route", render: (row) => String(row.route || "—") },
    { key: "date", label: "Date", render: (row) => String(row.travel_date || row.created_at || "—") },
    { key: "referralCode", label: "Referral code", render: (row) => String(row.referral_code || "—") },
    { key: "ambassador", label: "Ambassador", render: (row) => String(row.ambassador_name || "—") },
    { key: "commission", label: "Commission", render: (row) => `MWK ${Number(row.commission_amount || 0).toLocaleString()}` },
    {
      key: "status",
      label: "Status",
      render: (row) => {
        const status = String(row.commission_status || row.status || "pending");
        return <Badge tone={commissionStatusTone(status)}>{status}</Badge>;
      },
    },
    {
      key: "payment",
      label: "Payment",
      render: (row) => {
        const summary = row.booking_payment_status as BookingPaymentSummary | null | undefined;
        const { label, tone } = bookingPaymentStatus(summary);
        return <Badge tone={tone}>{label}</Badge>;
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Referral bookings" title="All bookings generated through referral codes" />

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search student name or phone" className="input-field" />
          <select value={ambassadorFilter} onChange={(e) => setAmbassadorFilter(e.target.value)} className="input-field">
            <option value="all">All ambassadors</option>
            {ambassadors.map((ambassador) => (
              <option key={String(ambassador.id)} value={String(ambassador.id)}>
                {String(ambassador.full_name || ambassador.name || "—")}
              </option>
            ))}
          </select>
          <select value={routeFilter} onChange={(e) => setRouteFilter(e.target.value)} className="input-field">
            <option value="all">All routes</option>
            {[...new Set(rows.map((row) => String(row.route || "")))].filter(Boolean).map((route) => (
              <option key={route} value={route}>
                {route}
              </option>
            ))}
          </select>
          <input value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} type="date" className="input-field" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-field">
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="paid">Paid</option>
          </select>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={filteredRows}
        getRowKey={(row) => String(row.id)}
        loading={loading}
        loadingLabel="Loading referral bookings…"
        emptyTitle="No referral bookings found"
        emptyDescription="Bookings made with an ambassador's referral code will show up here."
      />
    </div>
  );
}
