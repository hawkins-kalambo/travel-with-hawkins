"use client";

import { FormEvent, useEffect, useState } from "react";
import { authFetch } from "@/lib/auth";
import { formatMwk } from "@/lib/routePricing";

type ServiceApproval = {
  id: string;
  service_type: string;
  status: string;
  notes: string | null;
};

type Vehicle = {
  id: string;
  service_type: string;
  registration_number: string;
  make: string | null;
  model: string | null;
  status: string;
};

type CarHireListing = {
  id: string;
  daily_rate: number;
  driver_included: boolean;
  status: string;
  vehicle: { id: string; registration_number: string; make: string | null; model: string | null } | null;
};

const APPROVAL_STATUS_COPY: Record<string, { label: string; tone: string; message: string }> = {
  pending: { label: "Pending review", tone: "bg-amber-50 text-amber-800", message: "We're reviewing your request to offer car hire." },
  approved: { label: "Approved", tone: "bg-green-50 text-green-800", message: "List a verified car-hire vehicle and its daily rate below." },
  rejected: { label: "Not approved", tone: "bg-red-50 text-red-800", message: "Your request to offer car hire wasn't approved." },
  suspended: { label: "Suspended", tone: "bg-red-50 text-red-800", message: "Your car hire service is currently suspended." },
};

export default function CarHirePanel() {
  const [approval, setApproval] = useState<ServiceApproval | null>(null);
  const [listings, setListings] = useState<CarHireListing[]>([]);
  const [eligibleVehicles, setEligibleVehicles] = useState<Vehicle[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [listingForm, setListingForm] = useState({ vehicleId: "", dailyRate: "", driverIncluded: false });

  const load = async () => {
    const approvalsRes = await authFetch("/api/operators/service-approvals");
    const approvalsResult = await approvalsRes.json();
    const carHireApproval: ServiceApproval | undefined = approvalsResult.success
      ? approvalsResult.serviceApprovals.find((a: ServiceApproval) => a.service_type === "car_hire")
      : undefined;
    setApproval(carHireApproval ?? null);

    if (carHireApproval?.status === "approved") {
      const [listingsRes, vehiclesRes] = await Promise.all([authFetch("/api/operators/car-hire-listings"), authFetch("/api/operators/vehicles")]);
      const [listingsResult, vehiclesResult] = await Promise.all([listingsRes.json(), vehiclesRes.json()]);
      if (listingsResult.success) setListings(listingsResult.carHireListings);
      if (vehiclesResult.success) {
        const listedVehicleIds = new Set((listingsResult.carHireListings ?? []).map((l: CarHireListing) => l.vehicle?.id));
        setEligibleVehicles(
          vehiclesResult.vehicles.filter((v: Vehicle) => v.service_type === "car_hire" && v.status === "active" && !listedVehicleIds.has(v.id))
        );
      }
    }
    setLoaded(true);
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  const requestCarHireService = async () => {
    setError("");
    const response = await authFetch("/api/operators/service-approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceType: "car_hire" }),
    });
    const result = await response.json();
    if (!result.success) {
      setError(result.error || "Failed to request car hire service");
      return;
    }
    await load();
  };

  const addListing = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const response = await authFetch("/api/operators/car-hire-listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vehicleId: listingForm.vehicleId,
        dailyRate: Number(listingForm.dailyRate),
        driverIncluded: listingForm.driverIncluded,
      }),
    });
    const result = await response.json();
    if (!result.success) {
      setError(result.error || "Failed to add listing");
      return;
    }
    setListingForm({ vehicleId: "", dailyRate: "", driverIncluded: false });
    await load();
  };

  const toggleListingStatus = async (listing: CarHireListing) => {
    setError("");
    const response = await authFetch(`/api/operators/car-hire-listings/${listing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: listing.status === "active" ? "inactive" : "active" }),
    });
    const result = await response.json();
    if (!result.success) {
      setError(result.error || "Action failed");
      return;
    }
    await load();
  };

  const removeListing = async (listingId: string) => {
    setError("");
    const response = await authFetch(`/api/operators/car-hire-listings/${listingId}`, { method: "DELETE" });
    const result = await response.json();
    if (!result.success) {
      setError(result.error || "Action failed");
      return;
    }
    await load();
  };

  if (!loaded) return null;

  return (
    <div className="mt-6 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <h2 className="text-lg font-bold text-slate-900">Car hire</h2>

      {error && <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {!approval && (
        <div className="mt-3">
          <p className="text-sm text-slate-600">You haven&apos;t applied to offer car hire yet.</p>
          <button onClick={requestCarHireService} className="btn-primary mt-3">
            Request car hire service
          </button>
        </div>
      )}

      {approval && approval.status !== "approved" && (
        <div className="mt-3">
          <span className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${APPROVAL_STATUS_COPY[approval.status]?.tone ?? "bg-gray-100 text-gray-700"}`}>
            {APPROVAL_STATUS_COPY[approval.status]?.label ?? approval.status}
          </span>
          <p className="mt-2 text-sm text-slate-600">{APPROVAL_STATUS_COPY[approval.status]?.message}</p>
          {approval.notes && <p className="mt-1 text-sm text-slate-500">{approval.notes}</p>}
        </div>
      )}

      {approval && approval.status === "approved" && (
        <div className="mt-3">
          <p className="text-sm text-slate-600">
            List a verified car-hire vehicle with its daily rate. Register the vehicle under Fleet first (service type &quot;Car hire&quot;) and wait for admin verification.
          </p>

          <form onSubmit={addListing} className="mt-3 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-end">
            <select
              className="input-field w-full sm:w-auto"
              required
              value={listingForm.vehicleId}
              onChange={(e) => setListingForm({ ...listingForm, vehicleId: e.target.value })}
            >
              <option value="">Select a verified vehicle</option>
              {eligibleVehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.registration_number} {vehicle.make && `· ${vehicle.make} ${vehicle.model ?? ""}`}
                </option>
              ))}
            </select>
            <input
              className="input-field w-full sm:w-32"
              placeholder="Daily rate (MWK)"
              type="number"
              min={1}
              required
              value={listingForm.dailyRate}
              onChange={(e) => setListingForm({ ...listingForm, dailyRate: e.target.value })}
            />
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={listingForm.driverIncluded}
                onChange={(e) => setListingForm({ ...listingForm, driverIncluded: e.target.checked })}
              />
              Driver included
            </label>
            <button type="submit" className="btn-primary w-full sm:w-auto" disabled={eligibleVehicles.length === 0}>
              Add listing
            </button>
          </form>
          {eligibleVehicles.length === 0 && (
            <p className="mt-2 text-xs text-slate-500">No verified car-hire vehicles available to list yet.</p>
          )}

          <div className="mt-4 space-y-2">
            {listings.length === 0 && <p className="text-sm text-slate-500">No listings yet.</p>}
            {listings.map((listing) => (
              <div key={listing.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-100 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {listing.vehicle?.registration_number} {listing.vehicle?.make && `· ${listing.vehicle.make} ${listing.vehicle.model ?? ""}`}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatMwk(listing.daily_rate)}/day {listing.driver_included ? "· Driver included" : "· Self-drive"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${listing.status === "active" ? "bg-green-50 text-green-800" : "bg-gray-100 text-gray-700"}`}>
                    {listing.status}
                  </span>
                  <button onClick={() => toggleListingStatus(listing)} className="btn-secondary px-3 py-1 text-xs">
                    {listing.status === "active" ? "Deactivate" : "Activate"}
                  </button>
                  <button onClick={() => removeListing(listing.id)} className="btn-secondary px-3 py-1 text-xs">
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
