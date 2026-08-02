"use client";

import { IconX } from "@/app/components/Icon";

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
  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex-1 overflow-y-auto p-5">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-black">Book Trip</h2>
              <p className="text-sm text-slate-600">
                Destination: <span className="font-bold text-primary-700">{bookingType === "custom" ? customDestination || "Enter below" : selectedRoute}</span>
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
                  onClick={() => onSelectRoute(route)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold transition ${selectedRoute === route ? "border-primary-700 bg-primary-700 text-white" : "border-slate-200 text-slate-700 hover:border-primary-200"}`}
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
                <input className="input-field" placeholder="e.g. 0991 234 567" type="tel" value={form.phone} onChange={(e) => onFormChange({ ...form, phone: e.target.value })} />
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
                <label className="block text-sm font-bold text-slate-700">
                  <span className="mb-1.5 block text-xs">
                    Destination <span className="text-red-500">*</span>
                  </span>
                  <input className="input-field" placeholder="e.g. Karonga - Mzuzu" value={customDestination} onChange={(e) => onCustomDestinationChange(e.target.value)} />
                </label>
              )}

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
          <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-slate-700">
            <p className="font-semibold text-primary-700">Booking is available now</p>
            <p className="mt-1">You can continue as a guest and receive your booking confirmation right away.</p>
          </div>
          <button onClick={onSubmit} disabled={loading || !isFormValid} className="w-full rounded-md bg-primary-700 py-3.5 font-black text-white disabled:bg-slate-300">
            {loading ? "Processing..." : "Confirm Booking"}
          </button>
        </div>
      </div>
    </div>
  );
}
