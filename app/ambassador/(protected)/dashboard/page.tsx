"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { authFetch } from "@/lib/auth";
import Card from "@/app/components/ui/Card";
import Badge from "@/app/components/ui/Badge";
import Button from "@/app/components/ui/Button";
import EmptyState from "@/app/components/ui/EmptyState";
import { LoadingState } from "@/app/components/ui/Spinner";
import { commissionStatusTone } from "@/lib/statusTones";
import { generateManifestPdfBlob, type ManifestRow } from "@/lib/manifestGenerator";
import { IconDownload, IconPrinter, IconShare, IconUsers } from "@/app/components/Icon";

export default function AmbassadorDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [referrals, setReferrals] = useState<Array<Record<string, unknown>>>([]);
  const [stats, setStats] = useState({ totalReferrals: 0, confirmedBookings: 0, cancelledBookings: 0, totalEarnings: 0, pendingCommissions: 0, paidCommissions: 0, upcomingTrips: 0 });
  const [manifestMessage, setManifestMessage] = useState<string | null>(null);
  const referralLink = profile?.referral_code ? `${typeof window !== "undefined" ? window.location.origin : ""}/book?ref=${encodeURIComponent(String(profile.referral_code))}` : "—";

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const [profileRes, referralsRes] = await Promise.all([
          authFetch("/api/profile", { method: "GET" }),
          authFetch("/api/referrals", { method: "GET" }),
        ]);

        if (profileRes.ok) {
          const profileData = await profileRes.json();
          setProfile(profileData?.profile || null);
        }

        if (referralsRes.ok) {
          const referralsData = await referralsRes.json();
          const rows = Array.isArray(referralsData?.referrals) ? referralsData.referrals : [];
          setReferrals(rows);
          setStats({
            totalReferrals: rows.length,
            confirmedBookings: rows.filter((row: Record<string, unknown>) => String(row.commission_status || "").toLowerCase() === "approved").length,
            cancelledBookings: rows.filter((row: Record<string, unknown>) => String(row.commission_status || "").toLowerCase() === "cancelled").length,
            totalEarnings: rows.reduce((sum: number, row: Record<string, unknown>) => sum + Number(row.commission_amount || 0), 0),
            pendingCommissions: rows.filter((row: Record<string, unknown>) => String(row.commission_status || "").toLowerCase() === "pending").reduce((sum: number, row: Record<string, unknown>) => sum + Number(row.commission_amount || 0), 0),
            paidCommissions: rows.filter((row: Record<string, unknown>) => String(row.commission_status || "").toLowerCase() === "paid").reduce((sum: number, row: Record<string, unknown>) => sum + Number(row.commission_amount || 0), 0),
            upcomingTrips: rows.filter((row: Record<string, unknown>) => String(row.travel_date || "").trim()).length,
          });
        }
      } catch (error) {
        console.error("Failed to load ambassador dashboard", error);
      } finally {
        setLoading(false);
      }
    };

    void loadDashboard();
  }, []);

  const manifestRows: ManifestRow[] = referrals.map((row) => ({
    customerName: typeof row.customer_name === "string" ? row.customer_name : null,
    customerPhone: typeof row.customer_phone === "string" ? row.customer_phone : null,
    route: typeof row.route === "string" ? row.route : null,
    travelDate: typeof row.travel_date === "string" ? row.travel_date : null,
    commissionStatus: typeof row.commission_status === "string" ? row.commission_status : null,
  }));

  const ambassadorName = String(profile?.full_name || profile?.email || "Ambassador");
  const referralCode = String(profile?.referral_code || "—");

  const handleDownloadManifest = () => {
    const blob = generateManifestPdfBlob(ambassadorName, referralCode, manifestRows);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `manifest-${referralCode}.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handlePrintManifest = () => {
    const blob = generateManifestPdfBlob(ambassadorName, referralCode, manifestRows);
    const url = URL.createObjectURL(blob);
    const printWindow = window.open(url, "_blank");
    // Some browsers need the PDF to finish loading before print() fires;
    // this is best-effort (falls back to the user printing manually from
    // the opened tab if the browser blocks the auto-print call).
    printWindow?.addEventListener("load", () => printWindow.print());
  };

  const handleShareManifest = async () => {
    setManifestMessage(null);
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Travel with Hawkins referral link — ${ambassadorName}`,
          text: `Book with my referral code ${referralCode} on Travel with Hawkins.`,
          url: referralLink,
        });
        return;
      }
      await navigator.clipboard.writeText(referralLink);
      setManifestMessage("Referral link copied to clipboard.");
    } catch {
      setManifestMessage("Unable to share automatically — copy the referral link above manually.");
    }
  };

  if (loading) {
    return (
      <Card>
        <LoadingState label="Loading ambassador dashboard…" />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 overflow-hidden rounded-full bg-gray-100">
              {profile?.profile_image_url ? (
                <Image src={String(profile.profile_image_url)} alt={ambassadorName} width={64} height={64} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm font-bold text-gray-500">TW</div>
              )}
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary-700">Welcome back</p>
              <h1 className="text-xl font-black text-gray-800">{ambassadorName}</h1>
              <p className="text-sm text-gray-500">{referralCode}</p>
            </div>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-gray-100 p-3 text-sm text-gray-600">
            <p className="font-semibold text-gray-800">Referral link</p>
            <p className="mt-1 break-all">{referralLink}</p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        {[
          ["Total referrals", stats.totalReferrals],
          ["Confirmed bookings", stats.confirmedBookings],
          ["Cancelled bookings", stats.cancelledBookings],
          ["Total earnings", `MWK ${stats.totalEarnings.toLocaleString()}`],
          ["Pending commissions", `MWK ${stats.pendingCommissions.toLocaleString()}`],
          ["Paid commissions", `MWK ${stats.paidCommissions.toLocaleString()}`],
        ].map(([label, value]) => (
          <Card key={label} padding="sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">{label}</p>
            <p className="mt-2 text-xl font-black text-gray-800">{value}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black text-gray-800">My Customers</h2>
            <Link href="/ambassador/customers" className="text-sm font-semibold text-primary-700">
              Manage all
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {referrals.length === 0 ? (
              <EmptyState icon={<IconUsers className="h-8 w-8" />} title="No customers yet" description="Customers who book with your referral code will show up here." />
            ) : (
              referrals.slice(0, 5).map((referral) => (
                <div key={String(referral.id)} className="rounded-xl border border-gray-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-gray-800">{String(referral.customer_name || "—")}</p>
                      <p className="text-sm text-gray-500">{String(referral.customer_phone || "—")}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-800">{String(referral.route || "—")}</p>
                      <p className="text-xs text-gray-500">{String(referral.travel_date || "—")}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black text-gray-800">Commission overview</h2>
            <Link href="/ambassador/commissions" className="text-sm font-semibold text-primary-700">
              View history
            </Link>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-gray-200 p-3">
              <p className="text-sm text-gray-500">Total earned</p>
              <p className="text-xl font-black text-gray-800">MWK {stats.totalEarnings.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-gray-200 p-3">
              <p className="text-sm text-gray-500">Pending</p>
              <p className="text-xl font-black text-gray-800">
                MWK {stats.pendingCommissions.toLocaleString()} <Badge tone={commissionStatusTone("pending")}>Pending</Badge>
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 p-3">
              <p className="text-sm text-gray-500">Paid</p>
              <p className="text-xl font-black text-gray-800">
                MWK {stats.paidCommissions.toLocaleString()} <Badge tone={commissionStatusTone("paid")}>Paid</Badge>
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-dashed border-gray-300 bg-gray-100 p-4">
            <p className="text-sm font-semibold text-gray-800">Passenger manifest</p>
            <p className="mt-1 text-sm text-gray-500">Download or share a manifest of every passenger referred through your code.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={handlePrintManifest}>
                <IconPrinter className="h-4 w-4" /> Print manifest
              </Button>
              <Button variant="secondary" onClick={handleDownloadManifest}>
                <IconDownload className="h-4 w-4" /> Download PDF
              </Button>
              <Button variant="secondary" onClick={() => void handleShareManifest()}>
                <IconShare className="h-4 w-4" /> Share
              </Button>
            </div>
            {manifestMessage && <p className="mt-2 text-xs font-medium text-gray-600">{manifestMessage}</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}
