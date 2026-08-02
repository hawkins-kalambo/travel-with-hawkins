"use client";

import { DragEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { authFetch } from "@/lib/auth";
import { normalizeMalawiPhone } from "@/lib/phoneNumbers";

type ApplicationForm = {
  full_name: string;
  student_id: string;
  email: string;
  phone: string;
  whatsapp_number: string;
  university: string;
  faculty: string;
  program: string;
  year_of_study: string;
  motivation: string;
  leadership_experience: string;
  marketing_experience: string;
  communities: string;
  agree: boolean;
};

const STEP_LABELS = [
  "Personal Information",
  "Academic Information",
  "Ambassador Information",
  "Review & Submit",
] as const;

const DEFAULT_FORM: ApplicationForm = {
  full_name: "",
  student_id: "",
  email: "",
  phone: "",
  whatsapp_number: "",
  university: "Mzuzu University",
  faculty: "",
  program: "",
  year_of_study: "",
  motivation: "",
  leadership_experience: "",
  marketing_experience: "",
  communities: "",
  agree: false,
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AmbassadorApplyPage() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<ApplicationForm>(DEFAULT_FORM);
  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [profilePreview, setProfilePreview] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (profilePreview && profilePreview.startsWith("blob:")) {
        URL.revokeObjectURL(profilePreview);
      }
    };
  }, [profilePreview]);

  const setField = (name: keyof ApplicationForm, value: string | boolean) => {
    setForm((current) => ({ ...current, [name]: value }));
  };

  const touchField = (name: keyof ApplicationForm) => {
    setTouched((current) => ({ ...current, [name]: true }));
  };

  const getError = (name: keyof ApplicationForm) => {
    const value = form[name];
    switch (name) {
      case "full_name":
        if (!value) return "Please enter your full name.";
        return null;
      case "student_id":
        if (!value) return "Please enter your student ID.";
        return null;
      case "email":
        if (!value) return "Please enter your email address.";
        if (!EMAIL_REGEX.test(String(value))) return "Please enter a valid email address.";
        return null;
      case "phone":
        if (!value) return "Please enter your phone number.";
        if (!normalizeMalawiPhone(String(value))) return "Please enter a valid Malawi phone number (e.g. 099 123 4567).";
        return null;
      case "university":
        if (!value) return "Please enter your university.";
        return null;
      case "faculty":
        if (!value) return "Please enter your faculty.";
        return null;
      case "program":
        if (!value) return "Please enter your programme.";
        return null;
      case "year_of_study":
        if (!value) return "Please select your year of study.";
        return null;
      case "motivation":
        if (!value) return "Please tell us why you want to become an ambassador.";
        if (String(value).trim().length < 30) return "Tell us a little more in at least 30 characters.";
        return null;
      case "agree":
        if (!value) return "You must agree to the terms before continuing.";
        return null;
      default:
        return null;
    }
  };

  const validateStep = (currentStep: number) => {
    if (currentStep === 1) {
      return ["full_name", "student_id", "email", "phone"].every(
        (field) => !getError(field as keyof ApplicationForm)
      );
    }
    if (currentStep === 2) {
      return ["university", "faculty", "program", "year_of_study"].every(
        (field) => !getError(field as keyof ApplicationForm)
      );
    }
    if (currentStep === 3) {
      return !getError("motivation") && profileFile !== null && !getError("agree");
    }
    return true;
  };

  const touchStepFields = (currentStep: number) => {
    const fields: (keyof ApplicationForm)[] =
      currentStep === 1
        ? ["full_name", "student_id", "email", "phone"]
        : currentStep === 2
        ? ["university", "faculty", "program", "year_of_study"]
        : currentStep === 3
        ? ["motivation", "agree"]
        : [];

    setTouched((previous) => {
      const next = { ...previous };
      fields.forEach((field) => {
        next[field] = true;
      });
      return next;
    });
  };

  const nextStep = () => {
    if (!validateStep(step)) {
      touchStepFields(step);
      setMessage("Please fix the highlighted fields before continuing.");
      return;
    }
    setMessage(null);
    setStep((current) => Math.min(4, current + 1));
  };

  const previousStep = () => {
    setMessage(null);
    setStep((current) => Math.max(1, current - 1));
  };

  const handleFileChange = (file: File | null) => {
    setMessage(null);
    if (!file) {
      setProfileFile(null);
      if (profilePreview && profilePreview.startsWith("blob:")) {
        URL.revokeObjectURL(profilePreview);
      }
      setProfilePreview(null);
      return;
    }

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setMessage("Please upload a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage("Profile image must be under 5MB.");
      return;
    }

    if (profilePreview && profilePreview.startsWith("blob:")) {
      URL.revokeObjectURL(profilePreview);
    }

    // The file is only actually uploaded later, on form submit — this just
    // validates and previews it locally, so there's no real "progress" to
    // report here. A fake setInterval-based progress bar previously lived
    // here, animating regardless of any real upload happening.
    setProfileFile(file);
    const previewUrl = URL.createObjectURL(file);
    setProfilePreview(previewUrl);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    const dropped = event.dataTransfer?.files?.[0] ?? null;
    handleFileChange(dropped);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validateStep(3)) {
      setStep(3);
      touchStepFields(3);
      setMessage("Please complete the ambassador information before submitting.");
      return;
    }

    setMessage(null);
    setLoading(true);

    try {
      const payload: Record<string, unknown> = {
        full_name: form.full_name,
        student_id: form.student_id,
        email: form.email,
        phone: form.phone,
        whatsapp_number: form.whatsapp_number,
        university: form.university,
        faculty: form.faculty,
        program: form.program,
        year_of_study: form.year_of_study,
        motivation: form.motivation,
        leadership_experience: form.leadership_experience,
        marketing_experience: form.marketing_experience,
        communities: form.communities,
        termsAccepted: form.agree,
      };

      if (profileFile) {
        const reader = new FileReader();
        const fileBase64 = await new Promise<string | null>((resolve, reject) => {
          reader.onload = () => {
            const result = reader.result;
            if (typeof result === "string") resolve(result);
            else resolve(null);
          };
          reader.onerror = () => reject(new Error("Failed to read image file"));
          reader.readAsDataURL(profileFile);
        });

        if (fileBase64) {
          payload.profileImageBase64 = fileBase64;
        }
      }

      const response = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Submission failed. Please try again.");
      }

      setSubmitted(true);
    } catch (error: any) {
      setMessage(error?.message ?? "Submission failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <main className="min-h-screen bg-[#F8FAFC] px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-[32px] border border-slate-200 bg-white p-10 text-center shadow-xl">
            <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-emerald-50 text-5xl text-emerald-600">✓</div>
            <h1 className="text-3xl font-bold text-slate-900">Application submitted</h1>
            <p className="mt-4 text-slate-600">Thank you for your interest. Our team will review your application and contact you within 3–5 business days.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <a href="/" className="inline-flex min-w-[160px] items-center justify-center rounded-full bg-primary-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-primary-800">Return Home</a>
              <a href="/book" className="inline-flex min-w-[160px] items-center justify-center rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Explore Trips</a>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F8FAFC] text-slate-900">
      <nav className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="relative h-10 w-10 overflow-hidden rounded-2xl bg-slate-100 p-2">
              <Image src="/logo.png" alt="Travel with Hawkins" fill className="object-contain" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Travel with Hawkins</p>
              <p className="text-xs text-slate-500">Campus Ambassador Program</p>
            </div>
          </div>
          <div className="hidden items-center gap-4 md:flex">
            <a className="text-sm text-slate-600 hover:text-slate-900" href="/">Home</a>
            <a className="text-sm text-slate-600 hover:text-slate-900" href="/book">Book</a>
            <a className="text-sm text-slate-600 hover:text-slate-900" href="/about">About</a>
            <a className="rounded-full border border-primary-700 bg-[#EDF7FF] px-4 py-2 text-sm font-semibold text-primary-700 transition hover:bg-primary-700 hover:text-white" href="/ambassador/apply">Apply</a>
          </div>
        </div>
      </nav>

      <header className="mx-auto max-w-7xl px-4 pt-10 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div className="space-y-6">
            <p className="inline-flex rounded-full bg-[#E8F1FF] px-4 py-2 text-sm font-semibold text-primary-700">Ambassador application</p>
            <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">Join Malawi’s top student travel team with a simple four-step application.</h1>
            <p className="max-w-2xl text-lg leading-8 text-slate-600">Break the process into easy sections, review your details before submitting, and track your progress as you apply.</p>
            <div className="flex flex-wrap gap-3">
              <span className="rounded-full bg-[#F1F5FF] px-4 py-2 text-sm font-semibold text-primary-700">Fast startup-style onboarding</span>
              <span className="rounded-full bg-[#FFF4E5] px-4 py-2 text-sm font-semibold text-[#F7931E]">Designed for mobile-first applicants</span>
            </div>
          </div>
          <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-xl">
            <div className="grid gap-5">
              <div className="rounded-3xl bg-[#F8FAFF] p-5">
                <p className="text-sm uppercase tracking-[0.2em] text-primary-700">Application progress</p>
                <p className="mt-3 text-2xl font-semibold text-slate-900">Step {step} of 4</p>
              </div>
              <div className="rounded-3xl bg-white p-6 shadow-sm">
                <p className="text-sm font-semibold text-slate-900">What happens next</p>
                <ol className="mt-4 space-y-3 text-sm text-slate-600">
                  <li className="flex gap-3">
                    <span className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary-700 text-xs font-semibold text-white">1</span>
                    Submit your application and profile details.
                  </li>
                  <li className="flex gap-3">
                    <span className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#F7931E] text-xs font-semibold text-white">2</span>
                    Our team reviews your fit for the ambassador program.
                  </li>
                  <li className="flex gap-3">
                    <span className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">3</span>
                    Receive a decision and next steps by email.
                  </li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <ProgressStepper currentStep={step} />

            <form onSubmit={handleSubmit} className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-lg sm:p-10">
              <div className="space-y-8">
                {step === 1 && (
                  <div className="space-y-6">
                    <div className="grid gap-6 sm:grid-cols-2">
                      <FieldGroup label="Full name" hint="Required" error={touched.full_name ? getError("full_name") : null}>
                        <input
                          value={form.full_name}
                          onChange={(event) => setField("full_name", event.target.value)}
                          onBlur={() => touchField("full_name")}
                          className={inputClass(!!(touched.full_name && getError("full_name")))}
                          placeholder="Jane Doe"
                        />
                      </FieldGroup>
                      <FieldGroup label="Student ID" hint="Required" error={touched.student_id ? getError("student_id") : null}>
                        <input
                          value={form.student_id}
                          onChange={(event) => setField("student_id", event.target.value)}
                          onBlur={() => touchField("student_id")}
                          className={inputClass(!!(touched.student_id && getError("student_id")))}
                          placeholder="MZ-123456"
                        />
                      </FieldGroup>
                      <FieldGroup label="Email" hint="Required" error={touched.email ? getError("email") : null}>
                        <input
                          type="email"
                          value={form.email}
                          onChange={(event) => setField("email", event.target.value)}
                          onBlur={() => touchField("email")}
                          className={inputClass(!!(touched.email && getError("email")))}
                          placeholder="jane@example.com"
                        />
                      </FieldGroup>
                      <FieldGroup label="Phone number" hint="Required" error={touched.phone ? getError("phone") : null}>
                        <input
                          value={form.phone}
                          onChange={(event) => setField("phone", event.target.value)}
                          onBlur={() => touchField("phone")}
                          className={inputClass(!!(touched.phone && getError("phone")))}
                          placeholder="+265 999 123 456"
                        />
                      </FieldGroup>
                      <FieldGroup label="WhatsApp number" hint="Optional">
                        <input
                          value={form.whatsapp_number}
                          onChange={(event) => setField("whatsapp_number", event.target.value)}
                          onBlur={() => touchField("whatsapp_number")}
                          className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-primary-700 focus:bg-white"
                          placeholder="+265 999 123 456"
                        />
                      </FieldGroup>
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-6">
                    <div className="grid gap-6 sm:grid-cols-2">
                      <FieldGroup label="University" hint="Required" error={touched.university ? getError("university") : null}>
                        <input
                          value={form.university}
                          onChange={(event) => setField("university", event.target.value)}
                          onBlur={() => touchField("university")}
                          className={inputClass(!!(touched.university && getError("university")))}
                          placeholder="Mzuzu University"
                        />
                      </FieldGroup>
                      <FieldGroup label="Faculty" hint="Required" error={touched.faculty ? getError("faculty") : null}>
                        <input
                          value={form.faculty}
                          onChange={(event) => setField("faculty", event.target.value)}
                          onBlur={() => touchField("faculty")}
                          className={inputClass(!!(touched.faculty && getError("faculty")))}
                          placeholder="Business Management"
                        />
                      </FieldGroup>
                      <FieldGroup label="Programme" hint="Required" error={touched.program ? getError("program") : null}>
                        <input
                          value={form.program}
                          onChange={(event) => setField("program", event.target.value)}
                          onBlur={() => touchField("program")}
                          className={inputClass(!!(touched.program && getError("program")))}
                          placeholder="Bachelor of Commerce"
                        />
                      </FieldGroup>
                      <FieldGroup label="Year of study" hint="Required" error={touched.year_of_study ? getError("year_of_study") : null}>
                        <select
                          value={form.year_of_study}
                          onChange={(event) => setField("year_of_study", event.target.value)}
                          onBlur={() => touchField("year_of_study")}
                          className={inputClass(!!(touched.year_of_study && getError("year_of_study")))}
                        >
                          <option value="">Select year</option>
                          <option value="1">1</option>
                          <option value="2">2</option>
                          <option value="3">3</option>
                          <option value="4">4</option>
                          <option value="5">5</option>
                          <option value="6">6</option>
                        </select>
                      </FieldGroup>
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div className="space-y-6">
                    <FieldGroup label="Why do you want to become a Travel with Hawkins ambassador?" hint="Required" error={touched.motivation ? getError("motivation") : null}>
                      <textarea
                        value={form.motivation}
                        onChange={(event) => setField("motivation", event.target.value)}
                        onBlur={() => touchField("motivation")}
                        rows={5}
                        className={inputClass(!!(touched.motivation && getError("motivation")))}
                        placeholder="Share what excites you about representing Travel with Hawkins."
                      />
                    </FieldGroup>
                    <div className="grid gap-6 sm:grid-cols-2">
                      <FieldGroup label="Leadership experience" hint="Optional">
                        <textarea
                          value={form.leadership_experience}
                          onChange={(event) => setField("leadership_experience", event.target.value)}
                          rows={4}
                          className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-primary-700 focus:bg-white"
                          placeholder="Student council, event leadership, or club roles"
                        />
                      </FieldGroup>
                      <FieldGroup label="Marketing or sales experience" hint="Optional">
                        <textarea
                          value={form.marketing_experience}
                          onChange={(event) => setField("marketing_experience", event.target.value)}
                          rows={4}
                          className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-primary-700 focus:bg-white"
                          placeholder="Paid or volunteer marketing, sales, or promotions"
                        />
                      </FieldGroup>
                    </div>
                    <FieldGroup label="Student organisations or communities" hint="Optional">
                      <textarea
                        value={form.communities}
                        onChange={(event) => setField("communities", event.target.value)}
                        rows={3}
                        className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-primary-700 focus:bg-white"
                        placeholder="Clubs, sports, societies, or student groups"
                      />
                    </FieldGroup>

                    <div>
                      <div className="mb-4 flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Profile photo</p>
                          <p className="text-sm text-slate-500">Upload a clear headshot for your ambassador profile.</p>
                        </div>
                        <span className="rounded-full bg-[#EDF7FF] px-3 py-1 text-xs font-semibold text-primary-700">JPG, PNG, WebP • max 5MB</span>
                      </div>
                      <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={`group relative rounded-[30px] border-2 ${
                          dragActive ? "border-primary-700 bg-[#F1F5FF]" : "border-dashed border-slate-300 bg-slate-50"
                        } p-6 transition`}
                      >
                        <div className="flex flex-col items-center justify-center gap-4 text-center">
                          <div className="relative h-28 w-28 overflow-hidden rounded-full border-2 border-slate-200 bg-white shadow-sm">
                            {profilePreview ? (
                              <img src={profilePreview} alt="Profile preview" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-4xl text-slate-400">👤</div>
                            )}
                          </div>
                          <div className="space-y-2">
                            <p className="text-sm font-semibold text-slate-900">Drag & drop your photo here</p>
                            <p className="text-sm text-slate-500">or click to browse files from your device.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="rounded-full border border-primary-700 bg-white px-5 py-2 text-sm font-semibold text-primary-700 transition hover:bg-primary-700 hover:text-white"
                          >
                            Select photo
                          </button>
                        </div>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
                        />
                      </div>
                      {profileFile && (
                        <div className="mt-3 flex items-center justify-between rounded-3xl bg-gray-100 px-4 py-3 text-sm text-gray-700">
                          <div className="flex items-center gap-2">
                            <span className="text-success">✓</span>
                            <span>
                              {profileFile.name} • {(profileFile.size / 1024 / 1024).toFixed(2)} MB
                            </span>
                          </div>
                          <button type="button" onClick={() => handleFileChange(null)} className="font-semibold text-primary-700 hover:text-primary-800">
                            Remove
                          </button>
                        </div>
                      )}
                    </div>

                    <label className="flex items-start gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                      <input
                        type="checkbox"
                        checked={form.agree}
                        onChange={(event) => setField("agree", event.target.checked)}
                        onBlur={() => touchField("agree")}
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-primary-700 focus:ring-primary-700"
                      />
                      <div className="text-sm leading-6 text-slate-700">
                        I confirm that I will represent Travel with Hawkins professionally and uphold the company’s values.
                      </div>
                    </label>
                    {touched.agree && getError("agree") && <p className="text-sm text-red-600">{getError("agree")}</p>}
                  </div>
                )}

                {step === 4 && (
                  <div className="space-y-8">
                    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
                      <div className="rounded-[28px] border border-slate-200 bg-[#F8FAFF] p-6">
                        <h2 className="text-lg font-semibold text-slate-900">Your ambassador profile</h2>
                        <p className="mt-3 text-sm text-slate-600">Confirm your details before sending your application.</p>
                        <div className="mt-6 flex items-center gap-4">
                          <div className="relative h-24 w-24 overflow-hidden rounded-full border border-slate-200 bg-white">
                            {profilePreview ? (
                              <img src={profilePreview} alt="Profile preview" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-3xl text-slate-400">👤</div>
                            )}
                          </div>
                          <div>
                            <p className="text-sm text-slate-500">Profile photo</p>
                            <p className="mt-1 text-sm font-semibold text-slate-900">{profileFile?.name ?? "No photo selected"}</p>
                          </div>
                        </div>
                      </div>
                      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                        <h3 className="text-base font-semibold text-slate-900">Quick tips</h3>
                        <ul className="mt-4 space-y-3 text-sm text-slate-600">
                          <li>✅ Make sure your email and phone number are current.</li>
                          <li>✅ Choose a clear, professional photo.</li>
                          <li>✅ Review your motivation for a strong application.</li>
                        </ul>
                      </div>
                    </div>

                    <div className="grid gap-6 lg:grid-cols-3">
                      <SummarySection title="Personal Information">
                        <SummaryRow label="Full name" value={form.full_name} />
                        <SummaryRow label="Student ID" value={form.student_id} />
                        <SummaryRow label="Email" value={form.email} />
                        <SummaryRow label="Phone" value={form.phone} />
                        <SummaryRow label="WhatsApp" value={form.whatsapp_number || "Not provided"} />
                      </SummarySection>
                      <SummarySection title="Academic Information">
                        <SummaryRow label="University" value={form.university} />
                        <SummaryRow label="Faculty" value={form.faculty} />
                        <SummaryRow label="Programme" value={form.program} />
                        <SummaryRow label="Year of study" value={form.year_of_study} />
                      </SummarySection>
                      <SummarySection title="Ambassador Information">
                        <SummaryRow label="Motivation" value={form.motivation} />
                        <SummaryRow label="Leadership" value={form.leadership_experience || "Not provided"} />
                        <SummaryRow label="Marketing" value={form.marketing_experience || "Not provided"} />
                        <SummaryRow label="Communities" value={form.communities || "Not provided"} />
                      </SummarySection>
                    </div>
                  </div>
                )}
              </div>

              {message && <div className="rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{message}</div>}

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-between">
                <button
                  type="button"
                  onClick={previousStep}
                  disabled={step === 1 || loading}
                  className="inline-flex h-12 items-center justify-center rounded-full border border-slate-300 bg-white px-6 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Back
                </button>
                {step < 4 ? (
                  <button
                    type="button"
                    onClick={nextStep}
                    disabled={!validateStep(step) || loading}
                    className={`inline-flex h-12 items-center justify-center rounded-full px-6 text-sm font-semibold text-white transition ${
                      validateStep(step) && !loading ? "bg-primary-700 hover:bg-primary-800" : "bg-slate-300 cursor-not-allowed"
                    }`}
                  >
                    Next
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={loading}
                    className={`inline-flex h-12 items-center justify-center rounded-full px-6 text-sm font-semibold text-white transition ${
                      loading ? "bg-slate-300" : "bg-gradient-to-r from-primary-700 to-[#155ea6] hover:from-primary-800 hover:to-[#0f4f87]"
                    }`}
                  >
                    {loading ? "Submitting…" : "Submit application"}
                  </button>
                )}
              </div>
            </form>
          </div>

          <aside className="hidden rounded-[32px] border border-slate-200 bg-white p-6 shadow-lg lg:block">
            <div className="space-y-6">
              <div className="rounded-3xl bg-[#F5FAFF] p-6">
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary-700">What you’ll build</p>
                <p className="mt-4 text-sm leading-7 text-slate-700">The ambassador application is designed to feel fast, transparent, and organized. Each step is short, keeping you focused on the details that matter.</p>
              </div>
              <div className="rounded-3xl bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">Why join Travel with Hawkins?</h2>
                <ul className="mt-4 space-y-3 text-sm text-slate-600">
                  <li className="flex items-start gap-3">
                    <span className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary-700 text-white">✓</span>
                    Earn commissions on student referrals.
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary-700 text-white">✓</span>
                    Build leadership and marketing experience.
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary-700 text-white">✓</span>
                    Receive training and ambassador support.
                  </li>
                </ul>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary-700">Need help with your application?</p>
              <h2 className="mt-3 text-3xl font-black text-slate-900">Contact the Travel with Hawkins team</h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600">If you have questions about the ambassador application, profile photo upload, or next steps, get in touch with us directly.</p>
            </div>
            <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-6">
              <div className="space-y-4 text-sm text-slate-700">
                <div>
                  <p className="font-semibold text-slate-900">Email</p>
                  <a href="mailto:contact@travelwithhawkins.com" className="mt-1 block text-primary-700 hover:underline">contact@travelwithhawkins.com</a>
                </div>
                <div>
                  <p className="font-semibold text-slate-900">Phone</p>
                  <a href="tel:+265886470843" className="mt-1 block text-primary-700 hover:underline">+265 886 470 843</a>
                  <a href="tel:+265989127308" className="mt-1 block text-primary-700 hover:underline">+265 989 127 308</a>
                </div>
                <div>
                  <p className="font-semibold text-slate-900">WhatsApp</p>
                  <a href="https://wa.me/265989127308" target="_blank" rel="noreferrer" className="mt-1 block text-primary-700 hover:underline">Chat on WhatsApp</a>
                </div>
                <a href="/" className="inline-flex rounded-full bg-primary-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-primary-800">Return home</a>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}

function ProgressStepper({ currentStep }: { currentStep: number }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between text-sm text-slate-500">
        <span className="font-semibold text-slate-900">Step {currentStep} of 4</span>
        <span>{STEP_LABELS[currentStep - 1]}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        {STEP_LABELS.map((label, index) => {
          const stepIndex = index + 1;
          const isActive = currentStep === stepIndex;
          const isComplete = currentStep > stepIndex;
          return (
            <div key={label} className="flex items-center gap-3">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold ${
                  isComplete
                    ? "border-primary-700 bg-primary-700 text-white"
                    : isActive
                    ? "border-primary-700 bg-[#E8F1FF] text-primary-700"
                    : "border-slate-200 bg-white text-slate-500"
                }`}
              >
                {isComplete ? "✓" : stepIndex}
              </div>
              <div className="min-w-0 text-sm">
                <div className={`font-semibold ${isActive ? "text-slate-900" : "text-slate-500"}`}>{label}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function inputClass(hasError: boolean) {
  return `rounded-3xl border px-4 py-3 text-slate-900 outline-none transition focus:border-primary-700 focus:bg-white ${
    hasError ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50"
  }`;
}

function FieldGroup({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="block text-sm font-semibold text-slate-900">{label}</span>
        {hint ? <span className="text-sm text-slate-500">{hint}</span> : null}
      </div>
      {children}
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </label>
  );
}

function SummarySection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-[#F8FAFF] p-6">
      <h3 className="mb-4 text-base font-semibold text-slate-900">{title}</h3>
      <div className="space-y-3 text-sm text-slate-700">{children}</div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="space-y-1 rounded-3xl bg-white px-4 py-3 shadow-sm">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}
