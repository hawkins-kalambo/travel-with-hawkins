"use client";

import { useMemo, useState } from "react";

type WizardPayload = {
  fullName: string;
  studentId: string;
  email: string;
  phone: string;
  whatsappNumber: string;
  faculty: string;
  program: string;
  yearOfStudy: string;
  profileImageBase64?: string;
  referralCode: string;
  routeAssignment: string;
  university: string;
  status: string;
  temporaryPassword: string;
};

type WizardProps = {
  initialReferralCode?: string;
  onSubmit: (payload: WizardPayload) => Promise<void>;
  onCancel?: () => void;
};

const PASSWORD_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()";

function generateTemporaryPassword() {
  const array = new Uint8Array(12);
  crypto.getRandomValues(array);
  return `TWH-${Array.from(array)
    .map((byte) => PASSWORD_CHARS[byte % PASSWORD_CHARS.length])
    .join("")}`;
}

function stepLabel(step: number) {
  switch (step) {
    case 1:
      return "Personal information";
    case 2:
      return "Referral information";
    case 3:
      return "Account information";
    case 4:
      return "Review & submit";
    default:
      return "Ambassador creation";
  }
}

export default function AmbassadorCreationWizard({ initialReferralCode = "", onSubmit, onCancel }: WizardProps) {
  const [step, setStep] = useState(1);
  const [payload, setPayload] = useState<WizardPayload>({
    fullName: "",
    studentId: "",
    email: "",
    phone: "",
    whatsappNumber: "",
    faculty: "",
    program: "",
    yearOfStudy: "",
    profileImageBase64: undefined,
    referralCode: initialReferralCode,
    routeAssignment: "",
    university: "Mzuzu University",
    status: "active",
    temporaryPassword: generateTemporaryPassword(),
  });
  const [profilePreview, setProfilePreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const referralLink = useMemo(() => {
    if (!payload.referralCode) return "—";
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/book?ref=${encodeURIComponent(payload.referralCode)}`;
  }, [payload.referralCode]);

  const updateField = (field: keyof WizardPayload, value: string | undefined) => {
    setPayload((current) => ({ ...current, [field]: value ?? "" }));
  };

  const nextStep = () => setStep((current) => Math.min(4, current + 1));
  const prevStep = () => setStep((current) => Math.max(1, current - 1));

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        const nextValue = reader.result;
        setPayload((current) => ({ ...current, profileImageBase64: nextValue }));
        setProfilePreview(nextValue);
      }
    };
    reader.readAsDataURL(file);
  };

  const regeneratePassword = () => {
    setPayload((current) => ({ ...current, temporaryPassword: generateTemporaryPassword() }));
  };

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await onSubmit(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create ambassador.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#0f3f78]">New ambassador</p>
          <h2 className="mt-2 text-2xl font-black text-slate-900">Create ambassador</h2>
          <p className="mt-2 text-sm text-slate-500">Use the wizard to capture details, preview credentials, and confirm creation.</p>
        </div>
        <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">Step {step} of 4: {stepLabel(step)}</div>
      </div>

      {error ? <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      {step === 1 && (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <input className="input-field" placeholder="Full Name" value={payload.fullName} onChange={(e) => updateField("fullName", e.target.value)} />
            <input className="input-field" placeholder="Student ID" value={payload.studentId} onChange={(e) => updateField("studentId", e.target.value)} />
            <input className="input-field" type="email" placeholder="Email" value={payload.email} onChange={(e) => updateField("email", e.target.value)} />
            <input className="input-field" placeholder="Phone" value={payload.phone} onChange={(e) => updateField("phone", e.target.value)} />
            <input className="input-field" placeholder="WhatsApp Number" value={payload.whatsappNumber} onChange={(e) => updateField("whatsappNumber", e.target.value)} />
            <input className="input-field" placeholder="Faculty" value={payload.faculty} onChange={(e) => updateField("faculty", e.target.value)} />
            <input className="input-field" placeholder="Programme" value={payload.program} onChange={(e) => updateField("program", e.target.value)} />
            <input className="input-field" type="number" placeholder="Year of Study" value={payload.yearOfStudy} onChange={(e) => updateField("yearOfStudy", e.target.value)} />
          </div>
          <label className="block rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
            <span className="block font-semibold text-slate-700">Upload profile picture</span>
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleImageChange} className="mt-3 w-full text-sm" />
          </label>
          {profilePreview ? <img src={profilePreview} alt="Profile preview" className="h-28 w-28 rounded-full object-cover" /> : null}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <input className="input-field" placeholder="Referral Code" value={payload.referralCode} onChange={(e) => updateField("referralCode", e.target.value)} />
            <input className="input-field" placeholder="Campus Assignment" value={payload.university} onChange={(e) => updateField("university", e.target.value)} />
            <input className="input-field" placeholder="Route Assignment (optional)" value={payload.routeAssignment} onChange={(e) => updateField("routeAssignment", e.target.value)} />
            <select className="input-field" value={payload.status} onChange={(e) => updateField("status", e.target.value)}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
              <option value="pending verification">Pending verification</option>
            </select>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Referral link</p>
            <p className="mt-2 text-sm text-slate-900 break-all">{referralLink}</p>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Login Email</p>
              <p className="mt-2 text-sm text-slate-900">{payload.email || "—"}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Temporary Password</p>
              <p className="mt-2 text-sm font-semibold text-slate-900 break-all">{payload.temporaryPassword}</p>
              <button type="button" onClick={regeneratePassword} className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Regenerate Password
              </button>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Role</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">Ambassador</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Account status</p>
              <p className="mt-2 text-sm font-semibold text-slate-900 capitalize">{payload.status}</p>
            </div>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <h3 className="text-lg font-bold text-slate-900">Review ambassador details</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {[
                ["Full Name", payload.fullName],
                ["Student ID", payload.studentId],
                ["Email", payload.email],
                ["Phone", payload.phone],
                ["WhatsApp", payload.whatsappNumber],
                ["Faculty", payload.faculty],
                ["Programme", payload.program],
                ["Year", payload.yearOfStudy],
                ["University", payload.university],
                ["Referral Code", payload.referralCode],
                ["Referral Link", referralLink],
                ["Route Assignment", payload.routeAssignment],
                ["Temporary Password", payload.temporaryPassword],
                ["Status", payload.status],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-2xl bg-white p-4 shadow-sm">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{label}</p>
                  <p className="mt-2 text-sm text-slate-900 break-all">{String(value || "—")}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-between">
        <div className="flex gap-3">
          {step > 1 ? (
            <button type="button" onClick={prevStep} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Back
            </button>
          ) : null}
          {onCancel ? (
            <button type="button" onClick={onCancel} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
          ) : null}
        </div>

        <div className="flex gap-3">
          {step < 4 ? (
            <button type="button" onClick={nextStep} className="rounded-2xl bg-[#0f3f78] px-5 py-3 text-sm font-semibold text-white hover:bg-[#0a2d56]">
              Continue
            </button>
          ) : (
            <button type="button" onClick={submit} disabled={busy} className="rounded-2xl bg-[#0f3f78] px-5 py-3 text-sm font-semibold text-white hover:bg-[#0a2d56] disabled:opacity-50">
              {busy ? "Creating…" : "Create Ambassador"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
