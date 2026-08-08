"use client";

import { useEffect, useState } from "react";
import { IconX } from "@/app/components/Icon";
import { MALAWI_DISTRICTS } from "@/lib/tripSearchData";
import { normalizeMalawiPhone } from "@/lib/phoneNumbers";
import { fetchActiveRoutes, type ActiveRoute } from "@/lib/routesClient";
import { formatMwk } from "@/lib/routePricing";
import type { ActiveUniversity } from "@/lib/universitiesClient";
import { buildJourneyName, type JourneyDirection } from "@/lib/journeyDirection";

export type BookingFormState = {
  name: string;
  studentId: string;
  phone: string;
  email: string;
  seats: number;
  referralCode: string;
  travelDate: string;
};

export type ReferralValidationState = {
  state: "idle" | "checking" | "valid" | "invalid";
  message?: string;
  ambassadorName?: string;
};

const POPULAR_ROUTES = [
  "Lilongwe - Mzuzu",
  "Blantyre - Mzuzu",
  "Zomba - Mzuzu",
  "Kasungu - Mzuzu",
  "Karonga - Mzuzu",
];

type BookingModalProps = {
  bookingType: "route" | "custom";
  selectedRoute: string;
  customDestination: string;
  onSelectRoute: (route: string) => void;
  onCustomDestinationChange: (value: string) => void;
  routeOptions?: { routeId: string; label: string }[];
  onRouteOptionsChange?: (options: { routeId: string; label: string }[]) => void;
  selectedRouteId?: string;
  onSelectRouteId?: (routeId: string) => void;
  activeUniversities?: ActiveUniversity[];
  journeyDirection: JourneyDirection;
  onJourneyDirectionChange: (direction: JourneyDirection) => void;
  initialHomeDistrict?: string;
  initialUniversityName?: string;
  onHomeDistrictChange?: (district: string) => void;
  onUniversityNameChange?: (universityName: string) => void;
  error: string;
  form: BookingFormState;
  onFormChange: (form: BookingFormState) => void;
  referralValidation: ReferralValidationState;
  referralSource?: "link" | "manual" | null;
  onRemoveReferral?: () => void;
  today: string;
  loading: boolean;
  isFormValid: boolean;
  onSubmit: () => void;
  onClose: () => void;
};

export default function BookingModal({
  bookingType,
  selectedRoute,
  customDestination,
  onSelectRoute,
  onCustomDestinationChange,
  routeOptions = [],
  onRouteOptionsChange,
  selectedRouteId = "",
  onSelectRouteId,
  activeUniversities = [],
  journeyDirection,
  onJourneyDirectionChange,
  initialHomeDistrict = "",
  initialUniversityName = "",
  onHomeDistrictChange,
  onUniversityNameChange,
  error,
  form,
  onFormChange,
  referralValidation,
  referralSource,
  onRemoveReferral,
  today,
  loading,
  isFormValid,
  onSubmit,
  onClose,
}: BookingModalProps) {
  // Only the generic "Book Trip" open starts with an empty customDestination
  // — a booking arriving pre-resolved from the /book search flow (district +
  // university already known server-side, see app/book/page.tsx) keeps the
  // existing editable-text behavior below rather than fighting to re-derive
  // its district/university from that composed string. Decided once on
  // mount so clicking through the picker doesn't switch the UI back.
  const [useStructuredPicker] = useState(() => bookingType === "custom");

  const [district, setDistrict] = useState(initialHomeDistrict);
  const [universityId, setUniversityId] = useState("");
  const [routeChoices, setRouteChoices] = useState<ActiveRoute[]>([]);
  const [routeLookupState, setRouteLookupState] = useState<"idle" | "loading" | "resolved" | "none">("idle");

  useEffect(() => {
    if (!useStructuredPicker) return;
    if (!district || !universityId) {
      const resetTimer = window.setTimeout(() => {
        setRouteChoices([]);
        setRouteLookupState("idle");
      }, 0);
      return () => window.clearTimeout(resetTimer);
    }

    let cancelled = false;
    const loadingTimer = window.setTimeout(() => {
      if (!cancelled) setRouteLookupState("loading");
    }, 0);
    fetchActiveRoutes(district, universityId, journeyDirection).then((routes) => {
      if (cancelled) return;
      setRouteChoices(routes);
      setRouteLookupState(routes.length > 0 ? "resolved" : "none");
    });
    return () => {
      cancelled = true;
      window.clearTimeout(loadingTimer);
    };
  }, [useStructuredPicker, district, universityId, journeyDirection]);

  useEffect(() => {
    if (universityId || !initialUniversityName) return;
    const match = activeUniversities.find((university) => university.name === initialUniversityName);
    if (!match) return;
    const syncTimer = window.setTimeout(() => setUniversityId(match.id), 0);
    return () => window.clearTimeout(syncTimer);
  }, [activeUniversities, initialUniversityName, universityId]);

  useEffect(() => {
    if (!useStructuredPicker || !district || !universityId) return;
    const universityName = activeUniversities.find((u) => u.id === universityId)?.name || "";
    onCustomDestinationChange(buildJourneyName(district, universityName, journeyDirection));

    if (routeChoices.length === 1) {
      onSelectRouteId?.(routeChoices[0].id);
      onRouteOptionsChange?.([]);
    } else if (routeChoices.length > 1) {
      onSelectRouteId?.("");
      onRouteOptionsChange?.(routeChoices.map((r) => ({ routeId: r.id, label: r.pickupLabel || universityName })));
    } else {
      onSelectRouteId?.("");
      onRouteOptionsChange?.([]);
    }
  }, [
    useStructuredPicker,
    routeChoices,
    district,
    universityId,
    activeUniversities,
    journeyDirection,
    onCustomDestinationChange,
    onRouteOptionsChange,
    onSelectRouteId,
  ]);

  const resolvedFare =
    routeChoices.length === 1
      ? routeChoices[0].fare
      : routeChoices.find((r) => r.id === selectedRouteId)?.fare;

  const phoneValid = !form.phone.trim() || Boolean(normalizeMalawiPhone(form.phone));

  const resetResolvedRoute = () => {
    setRouteChoices([]);
    setRouteLookupState("idle");
    onSelectRouteId?.("");
    onRouteOptionsChange?.([]);
  };

  const changeJourneyDirection = (direction: JourneyDirection) => {
    resetResolvedRoute();
    onJourneyDirectionChange(direction);
  };

  const selectPopularRoute = (route: string) => {
    const homeDistrict = route.split(" - ")[0]?.trim() || "";
    const university = activeUniversities.find((item) => item.name.startsWith("Mzuzu University"));
    setDistrict(homeDistrict);
    setUniversityId(university?.id || "");
    onHomeDistrictChange?.(homeDistrict);
    onUniversityNameChange?.(university?.name || "Mzuzu University (MZUNI)");
    resetResolvedRoute();
    onJourneyDirectionChange("to_university");
    onSelectRoute("");
    onCustomDestinationChange(buildJourneyName(homeDistrict, university?.name || "Mzuzu University (MZUNI)", "to_university"));
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex-1 overflow-y-auto p-5">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-black">Book Trip</h2>
              <p className="text-sm text-slate-600">
                Destination: <span className="font-bold text-navy">{bookingType === "custom" ? customDestination || "Enter below" : selectedRoute}</span>
              </p>
            </div>
            <button onClick={onClose} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-700">
              <IconX className="h-5 w-5" />
            </button>
          </div>

          <div className="mb-5">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Popular routes</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {POPULAR_ROUTES.map((route) => (
                <button
                  key={route}
                  onClick={() => selectPopularRoute(route)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold transition ${selectedRoute === route ? "border-orange bg-orange text-white" : "border-slate-200 text-slate-700 hover:border-orange/40"}`}
                >
                  {route}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700" role="alert">
              {error}
            </div>
          )}

          <div className="space-y-5">
            <div className="space-y-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Your details</p>

              <label className="block text-sm font-bold text-slate-700">
                <span className="mb-1.5 block text-xs">
                  Full name <span className="text-red-500">*</span>
                </span>
                <input className="input-field" placeholder="e.g. John Banda" value={form.name} onChange={(e) => onFormChange({ ...form, name: e.target.value })} />
              </label>

              <label className="block text-sm font-bold text-slate-700">
                <span className="mb-1.5 block text-xs">
                  Student ID <span className="font-normal text-slate-400">(optional)</span>
                </span>
                <input className="input-field" placeholder="e.g. BSC/12/2023" value={form.studentId} onChange={(e) => onFormChange({ ...form, studentId: e.target.value })} />
              </label>

              <label className="block text-sm font-bold text-slate-700">
                <span className="mb-1.5 block text-xs">
                  Phone number <span className="text-red-500">*</span>
                </span>
                <input
                  className={`input-field ${phoneValid ? "" : "border-red-400 focus:border-red-400"}`}
                  placeholder="e.g. 0991 234 567"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => onFormChange({ ...form, phone: e.target.value })}
                />
                {!phoneValid && (
                  <span className="mt-1 block text-xs font-normal text-red-600">
                    Enter a valid Malawi mobile number (e.g. 0991 234 567 or +265991234567).
                  </span>
                )}
              </label>

              <label className="block text-sm font-bold text-slate-700">
                <span className="mb-1.5 block text-xs">
                  Email address <span className="font-normal text-slate-400">(optional)</span>
                </span>
                <input className="input-field" placeholder="you@example.com" type="email" value={form.email} onChange={(e) => onFormChange({ ...form, email: e.target.value })} />
              </label>

              {referralSource === "link" && referralValidation.state === "valid" ? (
                <div className="flex items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                  <span>
                    Referred by <strong>{referralValidation.ambassadorName || "an ambassador"}</strong> — thanks for supporting them!
                  </span>
                  {onRemoveReferral && (
                    <button type="button" onClick={onRemoveReferral} className="shrink-0 text-xs font-semibold text-emerald-700 underline">
                      Not you?
                    </button>
                  )}
                </div>
              ) : (
                <label className="block text-sm font-bold text-slate-700">
                  <span className="mb-1.5 block text-xs">
                    Referral code <span className="font-normal text-slate-400">(optional)</span>
                  </span>
                  <input className="input-field" placeholder="e.g. AMB1234" value={form.referralCode} onChange={(e) => onFormChange({ ...form, referralCode: e.target.value })} />
                </label>
              )}
              {referralSource !== "link" && referralValidation.state !== "idle" && (
                <p className={`text-sm ${referralValidation.state === "valid" ? "text-emerald-600" : referralValidation.state === "checking" ? "text-slate-500" : "text-red-600"}`}>
                  {referralValidation.message}
                </p>
              )}
            </div>

            <div className="space-y-4 border-t border-slate-100 pt-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Trip details</p>

              {bookingType === "custom" && (
                <fieldset>
                  <legend className="mb-2 text-xs font-bold text-slate-700">Where are you travelling?</legend>
                  <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
                    {([[
                      "to_university",
                      "Going to university",
                    ], [
                      "from_university",
                      "Going home",
                    ]] as const).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={journeyDirection === value}
                        onClick={() => changeJourneyDirection(value)}
                        className={`min-h-11 rounded-lg px-2 text-xs font-black transition ${journeyDirection === value ? "bg-white text-orange shadow-sm" : "text-slate-600"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}

              {routeOptions.length > 1 && (
                <label className="block text-sm font-bold text-slate-700">
                  <span className="mb-1.5 block text-xs">
                    {journeyDirection === "from_university" ? "Campus pickup point" : "District pickup point"} <span className="text-red-500">*</span>
                  </span>
                  <select
                    className="input-field"
                    value={selectedRouteId}
                    onChange={(e) => onSelectRouteId?.(e.target.value)}
                  >
                    <option value="">Select {journeyDirection === "from_university" ? "campus" : "district"} point</option>
                    {routeOptions.map((option) => (
                      <option key={option.routeId} value={option.routeId}>{option.label}</option>
                    ))}
                  </select>
                </label>
              )}

              {routeChoices.length === 1 && routeChoices[0].pickupLabel && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                  <span className="font-bold">{journeyDirection === "from_university" ? "Campus pickup" : "District pickup"}:</span>{" "}
                  {routeChoices[0].pickupLabel}
                </div>
              )}

              {!useStructuredPicker && routeOptions.length === 1 && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                  <span className="font-bold">{journeyDirection === "from_university" ? "Campus pickup" : "District pickup"}:</span>{" "}
                  {routeOptions[0].label}
                </div>
              )}

              {bookingType === "custom" && useStructuredPicker ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <label className={`block text-sm font-bold text-slate-700 ${journeyDirection === "from_university" ? "order-2" : "order-1"}`}>
                      <span className="mb-1.5 block text-xs">
                        {journeyDirection === "from_university" ? "To home district" : "From home district"} <span className="text-red-500">*</span>
                      </span>
                      <select className="input-field" value={district} onChange={(e) => {
                        resetResolvedRoute();
                        setDistrict(e.target.value);
                        onHomeDistrictChange?.(e.target.value);
                      }}>
                        <option value="">Select district</option>
                        {MALAWI_DISTRICTS.map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </label>

                    <label className={`block text-sm font-bold text-slate-700 ${journeyDirection === "from_university" ? "order-1" : "order-2"}`}>
                      <span className="mb-1.5 block text-xs">
                        {journeyDirection === "from_university" ? "From university" : "To university"} <span className="text-red-500">*</span>
                      </span>
                      <select className="input-field" value={universityId} onChange={(e) => {
                        resetResolvedRoute();
                        setUniversityId(e.target.value);
                        onUniversityNameChange?.(activeUniversities.find((university) => university.id === e.target.value)?.name || "");
                      }}>
                        <option value="">Select university</option>
                        {activeUniversities.map((u) => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {routeLookupState === "loading" && (
                    <p className="text-xs text-slate-500">Checking available routes…</p>
                  )}

                  {routeLookupState === "none" && (
                    <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3">
                      <p className="text-xs font-medium text-amber-800">
                        We don&apos;t have a live route for this yet — enter your destination and we&apos;ll confirm the fare with you.
                      </p>
                      <input
                        className="input-field"
                        placeholder="e.g. Karonga - Mzuzu University"
                        value={customDestination}
                        onChange={(e) => onCustomDestinationChange(e.target.value)}
                      />
                    </div>
                  )}

                  {resolvedFare != null && (
                    <p className="text-sm font-black text-navy">Estimated fare: {formatMwk(resolvedFare)}</p>
                  )}
                </div>
              ) : bookingType === "custom" ? (
                <label className="block text-sm font-bold text-slate-700">
                  <span className="mb-1.5 block text-xs">
                    Destination <span className="text-red-500">*</span>
                  </span>
                  <input className="input-field" placeholder="e.g. Karonga - Mzuzu" value={customDestination} onChange={(e) => onCustomDestinationChange(e.target.value)} />
                </label>
              ) : null}

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-bold text-slate-700">
                  <span className="mb-1.5 block text-xs">Travel date</span>
                  <input className="input-field" type="date" min={today} value={form.travelDate} onChange={(e) => onFormChange({ ...form, travelDate: e.target.value })} />
                </label>

                <label className="block text-sm font-bold text-slate-700">
                  <span className="mb-1.5 block text-xs">Seats</span>
                  <select className="input-field" value={form.seats} onChange={(e) => onFormChange({ ...form, seats: Number(e.target.value) })}>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <option key={n} value={n}>{n} seat{n > 1 ? "s" : ""}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 p-5 pt-4">
          <div className="mb-3 rounded-lg border border-orange/20 bg-orange-soft p-3 text-sm text-slate-700">
            <p className="font-semibold text-navy">Booking is available now</p>
            <p className="mt-1">You can continue as a guest and receive your booking confirmation right away.</p>
          </div>
          <button onClick={onSubmit} disabled={loading || !isFormValid} className="w-full rounded-md bg-orange py-3.5 font-black text-white transition hover:bg-orange-hover disabled:bg-slate-300 disabled:hover:bg-slate-300">
            {loading ? "Processing..." : "Confirm Booking"}
          </button>
        </div>
      </div>
    </div>
  );
}
