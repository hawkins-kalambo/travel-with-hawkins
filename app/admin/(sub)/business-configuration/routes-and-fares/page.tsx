"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  loadBusinessSettings,
  saveBusinessSettings,
  loadUniversities,
  loadRoutes,
  createRoute as createStructuredRouteApi,
  updateRoute as updateStructuredRouteApi,
  deleteRoute as deleteStructuredRouteApi,
  loadDistrictPickupPoints,
  createDistrictPickupPoint,
  updateDistrictPickupPoint,
  type University,
  type StructuredRoute,
  type DistrictPickupPoint,
} from "@/app/admin/(sub)/business-configuration/businessConfigClient";
import { MALAWI_DISTRICTS } from "@/lib/tripSearchData";
import { journeyDirectionLabel, type JourneyDirection } from "@/lib/journeyDirection";
import type { RouteType } from "@/app/admin/(sub)/business-configuration/businessConfigClient";
import { authFetch } from "@/lib/auth";

const ROUTE_TYPES: { value: RouteType; label: string }[] = [
  { value: "student", label: "Student (home ⇄ university)" },
  { value: "general", label: "General (district ⇄ district)" },
  { value: "both", label: "Both" },
];

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

const COMMISSION_TYPES: { value: "fixed" | "percentage"; label: string }[] = [
  { value: "fixed", label: "Fixed amount" },
  { value: "percentage", label: "Percentage" },
];

function emptyRouteDraft() {
  return {
    routeType: "student" as RouteType,
    originDistrict: "",
    destinationDistrict: "",
    universityId: "",
    pickupPointId: "",
    districtPickupPointId: "",
    direction: "to_university" as JourneyDirection,
    fare: "0",
    commissionAmount: "0",
    commissionType: "fixed" as "fixed" | "percentage",
    isPopular: false,
    popularOrder: "",
  };
}

export default function RoutesAndFaresPage() {
  const [routes, setRoutes] = useState<RouteObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [universities, setUniversities] = useState<University[]>([]);
  const [structuredRoutes, setStructuredRoutes] = useState<StructuredRoute[]>([]);
  const [structuredLoading, setStructuredLoading] = useState(true);
  const [structuredSaving, setStructuredSaving] = useState<string | null>(null);
  const [structuredError, setStructuredError] = useState<string | null>(null);
  const [routeDraft, setRouteDraft] = useState(emptyRouteDraft());
  const [districtPickupPoints, setDistrictPickupPoints] = useState<DistrictPickupPoint[]>([]);
  const [districtPointDraft, setDistrictPointDraft] = useState({ universityId: "", district: "", label: "" });
  const [isUniversityAdmin, setIsUniversityAdmin] = useState(false);

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

  useEffect(() => {
    void authFetch("/api/profile")
      .then(async (response) => response.json() as Promise<{ profile?: { role?: string } }>)
      .then((body) => setIsUniversityAdmin(body.profile?.role === "university_admin"))
      .catch(() => undefined);
  }, []);

  const refreshStructured = async () => {
    const [universitiesData, routesData, districtPointsData] = await Promise.all([loadUniversities(), loadRoutes(), loadDistrictPickupPoints()]);
    setUniversities(universitiesData);
    setStructuredRoutes(routesData);
    setDistrictPickupPoints(districtPointsData);
  };

  useEffect(() => {
    const init = async () => {
      try {
        const [universitiesData, routesData, districtPointsData] = await Promise.all([loadUniversities(), loadRoutes(), loadDistrictPickupPoints()]);
        setUniversities(universitiesData);
        setStructuredRoutes(routesData);
        setDistrictPickupPoints(districtPointsData);
      } catch (err) {
        setStructuredError(err instanceof Error ? err.message : String(err));
      } finally {
        setStructuredLoading(false);
      }
    };

    void init();
  }, []);

  const flashStructured = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(null), 3000);
  };

  const pickupPointsFor = (universityId: string) =>
    universities.find((u) => u.id === universityId)?.pickupPoints || [];

  const districtPointsFor = (universityId: string, district: string) =>
    districtPickupPoints.filter((point) => point.university_id === universityId && point.district === district);

  const addDistrictPoint = async () => {
    if (!districtPointDraft.universityId || !districtPointDraft.district || !districtPointDraft.label.trim()) {
      setStructuredError("Choose a university and district, then enter the pickup point name.");
      return;
    }
    setStructuredSaving("new-district-point");
    setStructuredError(null);
    try {
      await createDistrictPickupPoint({ ...districtPointDraft, status: "active" });
      setDistrictPointDraft({ ...districtPointDraft, label: "" });
      await refreshStructured();
      flashStructured("District pickup point added.");
    } catch (err) {
      setStructuredError(err instanceof Error ? err.message : String(err));
    } finally {
      setStructuredSaving(null);
    }
  };

  const toggleDistrictPoint = async (point: DistrictPickupPoint) => {
    setStructuredSaving(point.id);
    setStructuredError(null);
    try {
      await updateDistrictPickupPoint({ id: point.id, status: point.status === "active" ? "inactive" : "active" });
      await refreshStructured();
    } catch (err) {
      setStructuredError(err instanceof Error ? err.message : String(err));
    } finally {
      setStructuredSaving(null);
    }
  };

  const saveDistrictPointLabel = async (point: DistrictPickupPoint) => {
    if (!point.label.trim()) return;
    setStructuredSaving(point.id);
    setStructuredError(null);
    try {
      await updateDistrictPickupPoint({ id: point.id, label: point.label.trim() });
      await refreshStructured();
      flashStructured("District pickup point updated.");
    } catch (err) {
      setStructuredError(err instanceof Error ? err.message : String(err));
    } finally {
      setStructuredSaving(null);
    }
  };

  const addStructuredRoute = async () => {
    const isGeneral = routeDraft.routeType === "general";
    if (isGeneral) {
      if (!routeDraft.originDistrict || !routeDraft.destinationDistrict) {
        setStructuredError("Choose an origin district and a destination district.");
        return;
      }
      if (routeDraft.originDistrict === routeDraft.destinationDistrict) {
        setStructuredError("Origin and destination districts must be different.");
        return;
      }
    } else if (!routeDraft.originDistrict || !routeDraft.universityId || !routeDraft.districtPickupPointId) {
      setStructuredError("Choose a home district, university and district pickup/drop-off point.");
      return;
    }
    setStructuredSaving("new");
    setStructuredError(null);
    try {
      await createStructuredRouteApi(
        isGeneral
          ? {
              routeType: "general",
              originDistrict: routeDraft.originDistrict,
              destinationDistrict: routeDraft.destinationDistrict,
              fare: Number(routeDraft.fare) || 0,
              commissionAmount: Number(routeDraft.commissionAmount) || 0,
              commissionType: routeDraft.commissionType,
              isPopular: routeDraft.isPopular,
              popularOrder: routeDraft.popularOrder === "" ? null : Number(routeDraft.popularOrder) || 0,
              status: "inactive",
            }
          : {
              routeType: routeDraft.routeType,
              originDistrict: routeDraft.originDistrict,
              universityId: routeDraft.universityId,
              pickupPointId: routeDraft.pickupPointId || undefined,
              districtPickupPointId: routeDraft.districtPickupPointId,
              fare: Number(routeDraft.fare) || 0,
              commissionAmount: Number(routeDraft.commissionAmount) || 0,
              commissionType: routeDraft.commissionType,
              direction: routeDraft.direction,
              isPopular: routeDraft.isPopular,
              popularOrder: routeDraft.popularOrder === "" ? null : Number(routeDraft.popularOrder) || 0,
              status: "inactive",
            },
      );
      setRouteDraft(emptyRouteDraft());
      await refreshStructured();
      flashStructured("Route added as inactive — activate it once the fare is confirmed.");
    } catch (err) {
      setStructuredError(err instanceof Error ? err.message : String(err));
    } finally {
      setStructuredSaving(null);
    }
  };

  const saveStructuredRoute = async (route: StructuredRoute) => {
    setStructuredSaving(route.id);
    setStructuredError(null);
    try {
      await updateStructuredRouteApi({
        id: route.id,
        fare: route.fare,
        status: route.status,
        estimatedTravelTime: route.estimated_travel_time || undefined,
        capacity: route.capacity ?? undefined,
        commissionAmount: route.commission_amount,
        commissionType: route.commission_type,
        direction: route.direction,
        pickupPointId: route.pickup_point_id || undefined,
        districtPickupPointId: route.district_pickup_point_id || undefined,
        isPopular: route.is_popular,
        popularOrder: route.popular_order,
      });
      await refreshStructured();
      flashStructured("Route updated.");
    } catch (err) {
      setStructuredError(err instanceof Error ? err.message : String(err));
    } finally {
      setStructuredSaving(null);
    }
  };

  const removeStructuredRoute = async (id: string) => {
    setStructuredSaving(id);
    setStructuredError(null);
    try {
      await deleteStructuredRouteApi(id);
      await refreshStructured();
    } catch (err) {
      setStructuredError(err instanceof Error ? err.message : String(err));
    } finally {
      setStructuredSaving(null);
    }
  };

  const updateStructuredField = (id: string, changes: Partial<StructuredRoute>) => {
    setStructuredRoutes((current) => current.map((route) => (route.id === id ? { ...route, ...changes } : route)));
  };

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
              href={isUniversityAdmin ? "/admin" : "/admin/business-configuration"}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Back to Business Configuration
            </Link>
          </div>
        </div>

        {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{message}</div>}
        {error && <div className="rounded-2xl border border-danger/20 bg-danger/10 p-4 text-sm text-danger">{error}</div>}

        {!isUniversityAdmin && <><div className="grid gap-4 sm:grid-cols-3">
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
        </div></>}

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-xl font-semibold text-slate-900">University travel routes</h2>
            <Link href="/admin/business-configuration/universities" className="text-sm font-semibold text-[#0f3f78] hover:underline">
              Manage universities &amp; pickup points →
            </Link>
          </div>
          <p className="mb-5 text-sm text-slate-500">
            These power both home district → university and university → home district journeys. A route only appears to customers once both its university and its own status are
            &quot;active&quot;. New routes are added inactive by design, so a placeholder fare never goes live by accident.
          </p>

          {structuredError && <div className="mb-4 rounded-2xl border border-danger/20 bg-danger/10 p-4 text-sm text-danger">{structuredError}</div>}

          <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="font-bold text-slate-900">District pickup and drop-off points</h3>
            <p className="mt-1 text-sm text-slate-500">Create the actual landmark where students board when going to university, or leave the vehicle when going home.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-4 md:items-end">
              <select
                value={districtPointDraft.universityId}
                onChange={(e) => setDistrictPointDraft({ ...districtPointDraft, universityId: e.target.value })}
                className="input-field"
              >
                <option value="">Select university</option>
                {universities.map((university) => <option key={university.id} value={university.id}>{university.name}</option>)}
              </select>
              <select
                value={districtPointDraft.district}
                onChange={(e) => setDistrictPointDraft({ ...districtPointDraft, district: e.target.value })}
                className="input-field"
              >
                <option value="">Select district</option>
                {MALAWI_DISTRICTS.map((district) => <option key={district} value={district}>{district}</option>)}
              </select>
              <input
                value={districtPointDraft.label}
                onChange={(e) => setDistrictPointDraft({ ...districtPointDraft, label: e.target.value })}
                placeholder="e.g. Game Complex car park"
                className="input-field"
              />
              <button onClick={addDistrictPoint} disabled={structuredSaving === "new-district-point"} className="rounded-lg bg-[#0f3f78] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                Add district point
              </button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {districtPickupPoints.map((point) => (
                <div key={point.id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2">
                  <span className="text-xs font-bold text-slate-500">{point.district}</span>
                  <input
                    value={point.label}
                    onChange={(e) => setDistrictPickupPoints((current) => current.map((item) => item.id === point.id ? { ...item, label: e.target.value } : item))}
                    className="min-w-48 rounded-lg border border-slate-200 px-2 py-1 text-xs"
                  />
                  <button onClick={() => saveDistrictPointLabel(point)} disabled={structuredSaving === point.id} className="text-xs font-bold text-[#0f3f78]">Save</button>
                  <button
                    onClick={() => toggleDistrictPoint(point)}
                    disabled={structuredSaving === point.id}
                    className={`rounded-full border px-2 py-1 text-xs font-semibold ${point.status === "active" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-300 bg-slate-50 text-slate-500"}`}
                  >
                    {point.status}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="mb-6 grid gap-4 rounded-2xl border border-dashed border-slate-300 p-4 md:grid-cols-4 lg:grid-cols-7 lg:items-end">
            <label className="block text-sm text-slate-700">
              <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-slate-500">Route type</span>
              <select
                value={routeDraft.routeType}
                onChange={(e) => setRouteDraft({ ...routeDraft, routeType: e.target.value as RouteType })}
                className="input-field w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                {ROUTE_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </label>
            {routeDraft.routeType !== "general" && (
              <label className="block text-sm text-slate-700">
                <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-slate-500">Direction</span>
                <select
                  value={routeDraft.direction}
                  onChange={(e) => setRouteDraft({ ...routeDraft, direction: e.target.value as JourneyDirection })}
                  className="input-field w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="to_university">Going to university</option>
                  <option value="from_university">Going home</option>
                </select>
              </label>
            )}
            <label className="block text-sm text-slate-700">
              <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-slate-500">
                {routeDraft.routeType === "general" ? "Origin district" : "Home district"}
              </span>
              <select
                value={routeDraft.originDistrict}
                onChange={(e) => setRouteDraft({ ...routeDraft, originDistrict: e.target.value, districtPickupPointId: "" })}
                className="input-field w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">Select district</option>
                {MALAWI_DISTRICTS.map((district) => (
                  <option key={district} value={district}>{district}</option>
                ))}
              </select>
            </label>
            {routeDraft.routeType === "general" ? (
              <label className="block text-sm text-slate-700">
                <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-slate-500">Destination district</span>
                <select
                  value={routeDraft.destinationDistrict}
                  onChange={(e) => setRouteDraft({ ...routeDraft, destinationDistrict: e.target.value })}
                  className="input-field w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Select district</option>
                  {MALAWI_DISTRICTS.map((district) => (
                    <option key={district} value={district}>{district}</option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <label className="block text-sm text-slate-700">
                  <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-slate-500">University</span>
                  <select
                    value={routeDraft.universityId}
                    onChange={(e) => setRouteDraft({ ...routeDraft, universityId: e.target.value, pickupPointId: "", districtPickupPointId: "" })}
                    className="input-field w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">Select university</option>
                    {universities.map((university) => (
                      <option key={university.id} value={university.id}>{university.name}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm text-slate-700">
                  <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-slate-500">Campus point</span>
                  <select
                    value={routeDraft.pickupPointId}
                    onChange={(e) => setRouteDraft({ ...routeDraft, pickupPointId: e.target.value })}
                    disabled={!routeDraft.universityId}
                    className="input-field w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:opacity-60"
                  >
                    <option value="">Default</option>
                    {pickupPointsFor(routeDraft.universityId).map((point) => (
                      <option key={point.id} value={point.id}>{point.label}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm text-slate-700">
                  <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-slate-500">District point</span>
                  <select
                    value={routeDraft.districtPickupPointId}
                    onChange={(e) => setRouteDraft({ ...routeDraft, districtPickupPointId: e.target.value })}
                    disabled={!routeDraft.universityId || !routeDraft.originDistrict}
                    className="input-field w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:opacity-60"
                  >
                    <option value="">Select point</option>
                    {districtPointsFor(routeDraft.universityId, routeDraft.originDistrict).map((point) => (
                      <option key={point.id} value={point.id}>{point.label}{point.status !== "active" ? " (inactive)" : ""}</option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <label className="block text-sm text-slate-700">
              <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-slate-500">Fare (MWK)</span>
              <input
                type="number"
                value={routeDraft.fare}
                onChange={(e) => setRouteDraft({ ...routeDraft, fare: e.target.value })}
                className="input-field w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm text-slate-700">
              <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-slate-500">Ambassador commission</span>
              <select
                value={routeDraft.commissionType}
                onChange={(e) => setRouteDraft({ ...routeDraft, commissionType: e.target.value as "fixed" | "percentage" })}
                className="input-field w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                {COMMISSION_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-slate-700">
              <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-slate-500">
                {routeDraft.commissionType === "percentage" ? "Commission (%)" : "Commission (MWK)"}
              </span>
              <input
                type="number"
                value={routeDraft.commissionAmount}
                onChange={(e) => setRouteDraft({ ...routeDraft, commissionAmount: e.target.value })}
                className="input-field w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm text-slate-700">
              <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-slate-500">Popular order</span>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={routeDraft.isPopular}
                  onChange={(e) => setRouteDraft({ ...routeDraft, isPopular: e.target.checked })}
                  className="h-4 w-4"
                  aria-label="Show in Popular Routes"
                />
                <input
                  type="number"
                  min={1}
                  value={routeDraft.popularOrder}
                  onChange={(e) => setRouteDraft({ ...routeDraft, popularOrder: e.target.value })}
                  disabled={!routeDraft.isPopular}
                  placeholder="Order"
                  className="input-field w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:opacity-60"
                />
              </div>
            </label>
            <button
              onClick={addStructuredRoute}
              disabled={structuredSaving === "new"}
              className="rounded-lg bg-[#0f3f78] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0a2d56] disabled:opacity-60"
            >
              {structuredSaving === "new" ? "Adding…" : "Add route"}
            </button>
          </div>

          {structuredLoading ? (
            <p className="text-sm text-slate-500">Loading routes…</p>
          ) : structuredRoutes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
              No university travel routes configured yet.
            </div>
          ) : (
            <div className="space-y-3">
              {structuredRoutes.map((route) => (
                <div key={route.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        {route.route_type === "general"
                          ? `${route.origin_district} → ${route.destination_district || "Unknown"}`
                          : route.direction === "from_university"
                            ? `${route.university?.name || "Unknown university"} → ${route.origin_district}`
                            : `${route.origin_district} → ${route.university?.name || "Unknown university"}`}
                        {route.districtPickupPoint ? ` · District: ${route.districtPickupPoint.label}` : ""}
                        {route.pickupPoint ? ` · Campus: ${route.pickupPoint.label}` : ""}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-[#0f3f78]">
                        {route.route_type === "general"
                          ? "General travel"
                          : journeyDirectionLabel(route.direction === "general" ? "to_university" : route.direction)}
                        {route.is_popular ? ` · Popular #${route.popular_order ?? "?"}` : ""}
                      </p>
                      {route.route_type !== "general" && route.university?.status !== "active" && (
                        <p className="mt-1 text-xs font-semibold text-amber-700">University is inactive — this route stays hidden regardless of its own status.</p>
                      )}
                    </div>
                    <button
                      onClick={() => removeStructuredRoute(route.id)}
                      disabled={structuredSaving === route.id}
                      className="rounded-full border border-danger/30 bg-white px-4 py-2 text-xs font-semibold text-danger transition hover:bg-danger/5 disabled:opacity-60"
                    >
                      Delete
                    </button>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-5">
                    {route.route_type !== "general" && (
                      <label className="block text-sm text-slate-700">
                        <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-slate-500">Direction</span>
                        <select
                          value={route.direction}
                          onChange={(e) => updateStructuredField(route.id, { direction: e.target.value as JourneyDirection })}
                          className="input-field w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        >
                          <option value="to_university">Going to university</option>
                          <option value="from_university">Going home</option>
                        </select>
                      </label>
                    )}
                    <label className="block text-sm text-slate-700">
                      <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-slate-500">Fare (MWK)</span>
                      <input
                        type="number"
                        value={String(route.fare)}
                        onChange={(e) => updateStructuredField(route.id, { fare: Number(e.target.value) || 0 })}
                        className="input-field w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block text-sm text-slate-700">
                      <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-slate-500">Travel time</span>
                      <input
                        value={route.estimated_travel_time || ""}
                        onChange={(e) => updateStructuredField(route.id, { estimated_travel_time: e.target.value })}
                        placeholder="3h 20m"
                        className="input-field w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block text-sm text-slate-700">
                      <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-slate-500">Capacity</span>
                      <input
                        type="number"
                        value={String(route.capacity ?? 0)}
                        onChange={(e) => updateStructuredField(route.id, { capacity: Number(e.target.value) || 0 })}
                        className="input-field w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block text-sm text-slate-700">
                      <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-slate-500">Status</span>
                      <select
                        value={route.status}
                        onChange={(e) => updateStructuredField(route.id, { status: e.target.value })}
                        className="input-field w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </label>
                    <label className="block text-sm text-slate-700">
                      <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-slate-500">Popular Routes</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={route.is_popular}
                          onChange={(e) => updateStructuredField(route.id, { is_popular: e.target.checked })}
                          className="h-4 w-4"
                          aria-label="Show in Popular Routes"
                        />
                        <input
                          type="number"
                          min={1}
                          value={route.popular_order == null ? "" : String(route.popular_order)}
                          onChange={(e) => updateStructuredField(route.id, { popular_order: e.target.value === "" ? null : Number(e.target.value) || 0 })}
                          disabled={!route.is_popular}
                          placeholder="Order"
                          className="input-field w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:opacity-60"
                        />
                      </div>
                    </label>
                  </div>

                  {route.route_type !== "general" && <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className="block text-sm text-slate-700">
                      <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-slate-500">District pickup / drop-off</span>
                      <select
                        value={route.district_pickup_point_id || ""}
                        onChange={(e) => updateStructuredField(route.id, { district_pickup_point_id: e.target.value || null })}
                        className="input-field w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      >
                        <option value="">Select district point</option>
                        {districtPointsFor(route.university_id ?? "", route.origin_district).map((point) => (
                          <option key={point.id} value={point.id}>{point.label}{point.status !== "active" ? " (inactive)" : ""}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm text-slate-700">
                      <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-slate-500">University campus point</span>
                      <select
                        value={route.pickup_point_id || ""}
                        onChange={(e) => updateStructuredField(route.id, { pickup_point_id: e.target.value || null })}
                        className="input-field w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      >
                        <option value="">Default campus</option>
                        {pickupPointsFor(route.university_id ?? "").map((point) => (
                          <option key={point.id} value={point.id}>{point.label}{point.status !== "active" ? " (inactive)" : ""}</option>
                        ))}
                      </select>
                    </label>
                  </div>}

                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className="block text-sm text-slate-700">
                      <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-slate-500">Ambassador commission</span>
                      <select
                        value={route.commission_type}
                        onChange={(e) => updateStructuredField(route.id, { commission_type: e.target.value as "fixed" | "percentage" })}
                        className="input-field w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      >
                        {COMMISSION_TYPES.map((type) => (
                          <option key={type.value} value={type.value}>{type.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm text-slate-700">
                      <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-slate-500">
                        {route.commission_type === "percentage" ? "Commission (%)" : "Commission (MWK)"}
                      </span>
                      <input
                        type="number"
                        value={String(route.commission_amount)}
                        onChange={(e) => updateStructuredField(route.id, { commission_amount: Number(e.target.value) || 0 })}
                        className="input-field w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      />
                    </label>
                  </div>

                  <div className="mt-3 flex justify-end">
                    <button
                      onClick={() => saveStructuredRoute(route)}
                      disabled={structuredSaving === route.id}
                      className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
                    >
                      {structuredSaving === route.id ? "Saving…" : "Save changes"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
