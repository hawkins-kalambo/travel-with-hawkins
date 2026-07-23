"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { loadBusinessSettings, saveBusinessSettings } from "@/app/admin/business-configuration/businessConfigClient";

interface RouteObject {
  id: string;
  route_name: string;
  origin: string;
  destination: string;
  fare: number;
  status: string;
  estimated_travel_time: string;
  capacity: number;
  updated_at: string;
}

function newRouteObject(): RouteObject {
  return {
    id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    route_name: "",
    origin: "",
    destination: "",
    fare: 0,
    status: "active",
    estimated_travel_time: "",
    capacity: 0,
    updated_at: new Date().toISOString(),
  };
}

function formatMwk(value: number) {
  return `MWK ${value.toLocaleString("en-MW")}`;
}

function deriveRoutes(settings: Record<string, unknown>): RouteObject[] {
  const stored = settings.route_objects;
  if (Array.isArray(stored)) {
    return stored.map((route) => ({
      id: String((route as Record<string, unknown>).id ?? crypto.randomUUID?.() ?? ""),
      route_name: String((route as Record<string, unknown>).route_name ?? ""),
      origin: String((route as Record<string, unknown>).origin ?? ""),
      destination: String((route as Record<string, unknown>).destination ?? ""),
      fare: Number((route as Record<string, unknown>).fare ?? 0) || 0,
      status: String((route as Record<string, unknown>).status ?? "active"),
      estimated_travel_time: String((route as Record<string, unknown>).estimated_travel_time ?? ""),
      capacity: Number((route as Record<string, unknown>).capacity ?? 0) || 0,
      updated_at: String((route as Record<string, unknown>).updated_at ?? new Date().toISOString()),
    }));
  }

  const routesText = String(settings.routes ?? "");
  return routesText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [routePart, farePart] = line.split(":");
      const [origin = "", destination = ""] = (routePart || "").split("-").map((token) => token.trim());
      return {
        id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        route_name: (routePart || "").trim(),
        origin: origin.trim(),
        destination: destination.trim(),
        fare: Number((farePart || "").replace(/[^0-9.-]/g, "")) || 0,
        status: "active",
        estimated_travel_time: "",
        capacity: 0,
        updated_at: new Date().toISOString(),
      };
    });
}

export default function RoutesAndFaresPage() {
  const [routes, setRoutes] = useState<RouteObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const settings = await loadBusinessSettings();
        setRoutes(deriveRoutes(settings));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const nextRoutes = routes.map((route) => ({
        ...route,
        updated_at: new Date().toISOString(),
      }));
      const routeText = nextRoutes
        .map((route) => `${route.origin} - ${route.destination}: ${route.fare}`)
        .filter((line) => line.trim())
        .join("\n");

      await saveBusinessSettings({
        routeObjects: nextRoutes,
        routes: routeText,
      });
      setRoutes(nextRoutes);
      setMessage("Routes and fares saved successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
      window.setTimeout(() => setMessage(null), 3000);
    }
  };

  const updateRoute = (id: string, changes: Partial<RouteObject>) => {
    setRoutes((current) => current.map((route) => (route.id === id ? { ...route, ...changes } : route)));
  };

  const addRoute = () => setRoutes((current) => [...current, newRouteObject()]);
  const removeRoute = (id: string) => setRoutes((current) => current.filter((route) => route.id !== id));

  const activeCount = routes.filter((route) => route.status === "active").length;

  const routeSummary = useMemo(() => {
    const total = routes.length;
    const inactive = routes.filter((route) => route.status !== "active").length;
    const fareAverage = total > 0 ? Math.round(routes.reduce((sum, route) => sum + route.fare, 0) / total) : 0;
    return { total, inactive, fareAverage };
  }, [routes]);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#0f3f78]">Routes & Fares</p>
              <h1 className="text-3xl font-black text-slate-900">Manage route service objects</h1>
              <p className="mt-2 text-sm text-slate-500">Add and edit routes without code, including origin, destination, fare, capacity and active status.</p>
            </div>
            <Link
              href="/admin/business-configuration"
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Back to Business Configuration
            </Link>
          </div>
        </div>

        {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{message}</div>}
        {error && <div className="rounded-2xl border border-danger/20 bg-danger/10 p-4 text-sm text-danger">{error}</div>}

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Routes</p>
            <p className="mt-3 text-3xl font-semibold text-slate-900">{routeSummary.total}</p>
            <p className="mt-1 text-sm text-slate-500">{activeCount} active, {routeSummary.inactive} inactive</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Average fare</p>
            <p className="mt-3 text-3xl font-semibold text-slate-900">{formatMwk(routeSummary.fareAverage)}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Route status</p>
            <p className="mt-3 text-3xl font-semibold text-slate-900">{activeCount > 0 ? "Live" : "Paused"}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-xl font-semibold text-slate-900">Route catalogue</h2>
            <button
              onClick={addRoute}
              className="rounded-lg bg-[#0f3f78] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0a2d56]"
            >
              Add route
            </button>
          </div>

          {loading ? (
            <p className="text-sm text-slate-500">Loading routes…</p>
          ) : routes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
              No routes configured yet. Add your first route to start managing fares.
            </div>
          ) : (
            <div className="space-y-4">
              {routes.map((route) => (
                <div key={route.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm text-slate-500">Route name</p>
                      <input
                        value={route.route_name}
                        onChange={(e) => updateRoute(route.id, { route_name: e.target.value })}
                        placeholder="Route name"
                        className="input-field mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      />
                    </div>
                    <button
                      onClick={() => removeRoute(route.id)}
                      className="rounded-full border border-danger/30 bg-white px-4 py-2 text-sm font-semibold text-danger transition hover:bg-danger/5"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <label className="block text-sm text-slate-700">
                      <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-slate-500">Origin</span>
                      <input
                        value={route.origin}
                        onChange={(e) => updateRoute(route.id, { origin: e.target.value })}
                        className="input-field w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        placeholder="Mzuzu"
                      />
                    </label>
                    <label className="block text-sm text-slate-700">
                      <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-slate-500">Destination</span>
                      <input
                        value={route.destination}
                        onChange={(e) => updateRoute(route.id, { destination: e.target.value })}
                        className="input-field w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        placeholder="Lilongwe"
                      />
                    </label>
                    <label className="block text-sm text-slate-700">
                      <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-slate-500">Fare</span>
                      <input
                        type="number"
                        value={String(route.fare)}
                        onChange={(e) => updateRoute(route.id, { fare: Number(e.target.value) })}
                        className="input-field w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      />
                    </label>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <label className="block text-sm text-slate-700">
                      <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-slate-500">Travel time</span>
                      <input
                        value={route.estimated_travel_time}
                        onChange={(e) => updateRoute(route.id, { estimated_travel_time: e.target.value })}
                        className="input-field w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        placeholder="3h 20m"
                      />
                    </label>
                    <label className="block text-sm text-slate-700">
                      <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-slate-500">Capacity</span>
                      <input
                        type="number"
                        value={String(route.capacity)}
                        onChange={(e) => updateRoute(route.id, { capacity: Number(e.target.value) })}
                        className="input-field w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        placeholder="12"
                      />
                    </label>
                    <label className="block text-sm text-slate-700">
                      <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-slate-500">Status</span>
                      <select
                        value={route.status}
                        onChange={(e) => updateRoute(route.id, { status: e.target.value })}
                        className="input-field w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-[#0f3f78] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0a2d56] disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save routes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
