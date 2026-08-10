"use client";

import { FormEvent, useEffect, useState } from "react";
import { authFetch } from "@/lib/auth";

type Vehicle = {
  id: string;
  service_type: string;
  registration_number: string;
  make: string | null;
  model: string | null;
  capacity: number | null;
  status: string;
};

type Driver = {
  id: string;
  full_name: string;
  phone: string;
  license_number: string;
  status: string;
};

const VEHICLE_OPERATOR_ACTIONS: Record<string, { label: string; next: string }[]> = {
  pending: [{ label: "Remove", next: "__delete__" }],
  active: [
    { label: "Mark in maintenance", next: "maintenance" },
    { label: "Retire", next: "retired" },
  ],
  maintenance: [
    { label: "Mark active", next: "active" },
    { label: "Retire", next: "retired" },
  ],
  expired_documents: [{ label: "Retire", next: "retired" }],
};

const DRIVER_OPERATOR_ACTIONS: Record<string, { label: string; next: string }[]> = {
  verified: [{ label: "Mark inactive", next: "inactive" }],
  inactive: [{ label: "Mark verified", next: "verified" }],
};

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "active" || status === "verified"
      ? "bg-green-50 text-green-800"
      : status === "suspended" || status === "expired_documents" || status === "expired_licence"
        ? "bg-red-50 text-red-800"
        : status === "maintenance" || status === "inactive"
          ? "bg-orange-50 text-orange-800"
          : "bg-amber-50 text-amber-800";
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${tone}`}>{status.replace(/_/g, " ")}</span>;
}

export default function FleetPanel() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  const [vehicleForm, setVehicleForm] = useState({ serviceType: "intercity", registrationNumber: "", make: "", model: "", capacity: "" });
  const [driverForm, setDriverForm] = useState({ fullName: "", phone: "", licenseNumber: "" });

  const load = async () => {
    const [vehiclesRes, driversRes] = await Promise.all([authFetch("/api/operators/vehicles"), authFetch("/api/operators/drivers")]);
    const [vehiclesResult, driversResult] = await Promise.all([vehiclesRes.json(), driversRes.json()]);
    if (vehiclesResult.success) setVehicles(vehiclesResult.vehicles);
    if (driversResult.success) setDrivers(driversResult.drivers);
    setLoaded(true);
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  const addVehicle = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const response = await authFetch("/api/operators/vehicles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceType: vehicleForm.serviceType,
        registrationNumber: vehicleForm.registrationNumber,
        make: vehicleForm.make || undefined,
        model: vehicleForm.model || undefined,
        capacity: vehicleForm.capacity ? Number(vehicleForm.capacity) : undefined,
      }),
    });
    const result = await response.json();
    if (!result.success) {
      setError(result.error || "Failed to add vehicle");
      return;
    }
    setVehicleForm({ serviceType: "intercity", registrationNumber: "", make: "", model: "", capacity: "" });
    await load();
  };

  const addDriver = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const response = await authFetch("/api/operators/drivers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(driverForm),
    });
    const result = await response.json();
    if (!result.success) {
      setError(result.error || "Failed to add driver");
      return;
    }
    setDriverForm({ fullName: "", phone: "", licenseNumber: "" });
    await load();
  };

  const changeVehicleStatus = async (id: string, next: string) => {
    setError("");
    const response =
      next === "__delete__"
        ? await authFetch(`/api/operators/vehicles/${id}`, { method: "DELETE" })
        : await authFetch(`/api/operators/vehicles/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: next }),
          });
    const result = await response.json();
    if (!result.success) {
      setError(result.error || "Action failed");
      return;
    }
    await load();
  };

  const changeDriverStatus = async (id: string, next: string) => {
    setError("");
    const response = await authFetch(`/api/operators/drivers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    const result = await response.json();
    if (!result.success) {
      setError(result.error || "Action failed");
      return;
    }
    await load();
  };

  return (
    <div className="mt-6 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <h2 className="text-lg font-bold text-slate-900">Fleet</h2>
      <p className="mt-1 text-sm text-slate-600">Register vehicles and drivers. New entries need admin verification before they can carry bookings.</p>

      {error && <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="mt-5">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Vehicles</h3>
        <form onSubmit={addVehicle} className="mt-2 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-end">
          <select
            className="input-field w-full sm:w-auto"
            value={vehicleForm.serviceType}
            onChange={(e) => setVehicleForm({ ...vehicleForm, serviceType: e.target.value })}
          >
            <option value="intercity">Intercity</option>
            <option value="taxi">Taxi</option>
            <option value="car_hire">Car hire</option>
          </select>
          <input
            className="input-field w-full sm:w-auto"
            placeholder="Registration number"
            required
            value={vehicleForm.registrationNumber}
            onChange={(e) => setVehicleForm({ ...vehicleForm, registrationNumber: e.target.value })}
          />
          <input
            className="input-field w-full sm:w-auto"
            placeholder="Make"
            value={vehicleForm.make}
            onChange={(e) => setVehicleForm({ ...vehicleForm, make: e.target.value })}
          />
          <input
            className="input-field w-full sm:w-auto"
            placeholder="Model"
            value={vehicleForm.model}
            onChange={(e) => setVehicleForm({ ...vehicleForm, model: e.target.value })}
          />
          <input
            className="input-field w-full sm:w-24"
            placeholder="Seats"
            type="number"
            min={1}
            value={vehicleForm.capacity}
            onChange={(e) => setVehicleForm({ ...vehicleForm, capacity: e.target.value })}
          />
          <button type="submit" className="btn-primary w-full sm:w-auto">
            Add vehicle
          </button>
        </form>

        <div className="mt-3 space-y-2">
          {loaded && vehicles.length === 0 && <p className="text-sm text-slate-500">No vehicles yet.</p>}
          {vehicles.map((vehicle) => (
            <div key={vehicle.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-100 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {vehicle.registration_number} {vehicle.make && `· ${vehicle.make} ${vehicle.model ?? ""}`}
                </p>
                <p className="text-xs capitalize text-slate-500">{vehicle.service_type.replace("_", " ")}{vehicle.capacity ? ` · ${vehicle.capacity} seats` : ""}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={vehicle.status} />
                {(VEHICLE_OPERATOR_ACTIONS[vehicle.status] ?? []).map((action) => (
                  <button key={action.label} onClick={() => changeVehicleStatus(vehicle.id, action.next)} className="btn-secondary px-3 py-1 text-xs">
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Drivers</h3>
        <form onSubmit={addDriver} className="mt-2 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-end">
          <input
            className="input-field w-full sm:w-auto"
            placeholder="Full name"
            required
            value={driverForm.fullName}
            onChange={(e) => setDriverForm({ ...driverForm, fullName: e.target.value })}
          />
          <input
            className="input-field w-full sm:w-auto"
            placeholder="Phone"
            required
            value={driverForm.phone}
            onChange={(e) => setDriverForm({ ...driverForm, phone: e.target.value })}
          />
          <input
            className="input-field w-full sm:w-auto"
            placeholder="License number"
            required
            value={driverForm.licenseNumber}
            onChange={(e) => setDriverForm({ ...driverForm, licenseNumber: e.target.value })}
          />
          <button type="submit" className="btn-primary w-full sm:w-auto">
            Add driver
          </button>
        </form>

        <div className="mt-3 space-y-2">
          {loaded && drivers.length === 0 && <p className="text-sm text-slate-500">No drivers yet.</p>}
          {drivers.map((driver) => (
            <div key={driver.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-100 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{driver.full_name}</p>
                <p className="text-xs text-slate-500">
                  {driver.phone} · {driver.license_number}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={driver.status} />
                {(DRIVER_OPERATOR_ACTIONS[driver.status] ?? []).map((action) => (
                  <button key={action.label} onClick={() => changeDriverStatus(driver.id, action.next)} className="btn-secondary px-3 py-1 text-xs">
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
