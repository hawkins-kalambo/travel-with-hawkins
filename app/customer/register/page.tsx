"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signInWithGoogle } from "@/lib/customerAuth";
import AuthTabs from "../../components/AuthTabs";

export default function CustomerRegisterPage() {
  const router = useRouter();

  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    customerType: "student" as "student" | "public_traveler" | "corporate",
    studentId: "",
    university: "",
    faculty: "",
    programme: "",
    yearOfStudy: "",
    otpChannel: "email" as "email" | "sms",
  });

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleGoogleSignup = async () => {
    setError("");
    setGoogleLoading(true);

    try {
      const result = await signInWithGoogle();
      if (!result.success) {
        setError(result.error || "Unable to continue with Google");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");
    setLoading(true);

    try {
      const response = await fetch("/api/customers/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          confirmPassword: formData.confirmPassword,
          fullName: formData.fullName,
          phone: formData.phone,
          customerType: formData.customerType,
          studentId: formData.studentId || undefined,
          university: formData.university || undefined,
          faculty: formData.faculty || undefined,
          programme: formData.programme || undefined,
          yearOfStudy: formData.yearOfStudy ? parseInt(formData.yearOfStudy) : undefined,
          otpChannel: formData.otpChannel,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        setError(result.error || "Registration failed");
        setLoading(false);
        return;
      }

      setSuccessMessage(result.message || "Registration successful! Please check your email for a verification code.");
      const registeredEmail = formData.email;
      const registeredChannel = result.otpChannel || formData.otpChannel;
      setFormData({
        fullName: "",
        email: "",
        phone: "",
        password: "",
        confirmPassword: "",
        customerType: "student",
        studentId: "",
        university: "",
        faculty: "",
        programme: "",
        yearOfStudy: "",
        otpChannel: "email",
      });

      setTimeout(() => {
        router.push(`/customer/verify-email?email=${encodeURIComponent(registeredEmail)}&channel=${registeredChannel}`);
      }, 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-[#0A4D8C] to-[#0f3f78] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
          {/* Left Side - Branding */}
          <div className="flex flex-col justify-center text-white lg:pr-12">
            <Link href="/" className="mb-8 inline-flex w-fit items-center gap-3">
              <Image src="/logo.png" width={56} height={56} className="rounded-full object-cover" alt="Travel with Hawkins logo" />
              <span className="text-xl font-black">Travel with Hawkins</span>
            </Link>

            <div className="space-y-6">
              <div>
                <h1 className="text-4xl font-black leading-tight sm:text-5xl">Create Your Account</h1>
                <p className="mt-4 text-base text-slate-100/90">
                  Join us today to book trips, save your details for faster checkout, and manage every journey in one place.
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/20">
                    <span className="text-sm font-bold">✓</span>
                  </div>
                  <p className="text-sm">Book trips easily with saved preferences</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/20">
                    <span className="text-sm font-bold">✓</span>
                  </div>
                  <p className="text-sm">Access your boarding passes anytime</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/20">
                    <span className="text-sm font-bold">✓</span>
                  </div>
                  <p className="text-sm">Track and manage all your bookings in one dashboard</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side - Registration Form */}
          <div className="flex items-center justify-center py-4 lg:py-10">
            <div className="w-full max-w-md rounded-[28px] border border-white/20 bg-white p-6 shadow-2xl sm:p-8">
              <AuthTabs active="signup" />

              <div className="mb-6 text-center">
                <h2 className="text-2xl font-black text-slate-900">Create your account</h2>
                <p className="mt-2 text-sm text-slate-600">Join us today and start booking your trips</p>
              </div>

              {error && (
                <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  {error}
                </div>
              )}

              {successMessage && (
                <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
                  {successMessage}
                </div>
              )}

              <div className="mb-6">
                <button
                  type="button"
                  onClick={handleGoogleSignup}
                  disabled={googleLoading}
                  className="flex w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 px-4 py-3.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  {googleLoading ? "Redirecting to Google..." : "Continue with Google"}
                </button>
                <div className="mt-4 flex items-center gap-3">
                  <div className="flex-1 border-t border-slate-200" />
                  <span className="text-xs uppercase tracking-[0.24em] text-slate-400">or create with email</span>
                  <div className="flex-1 border-t border-slate-200" />
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
            {/* Full Name */}
            <div>
              <label htmlFor="fullName" className="mb-2 block text-sm font-semibold text-slate-700">
                Full Name *
              </label>
              <input
                id="fullName"
                name="fullName"
                type="text"
                value={formData.fullName}
                onChange={handleChange}
                placeholder="John Doe"
                required
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-[#0A4D8C] focus:ring-4 focus:ring-[#0A4D8C]/10"
              />
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-semibold text-slate-700">
                Email Address *
              </label>
              <input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="john@example.com"
                required
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-[#0A4D8C] focus:ring-4 focus:ring-[#0A4D8C]/10"
              />
            </div>

            {/* Phone */}
            <div>
              <label htmlFor="phone" className="mb-2 block text-sm font-semibold text-slate-700">
                Phone Number *
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                value={formData.phone}
                onChange={handleChange}
                placeholder="+265..."
                required
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-[#0A4D8C] focus:ring-4 focus:ring-[#0A4D8C]/10"
              />
            </div>

            {/* Verification code delivery */}
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                How should we send your verification code? *
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label
                  className={`flex cursor-pointer items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                    formData.otpChannel === "email"
                      ? "border-[#0A4D8C] bg-[#0A4D8C]/5 text-[#0A4D8C]"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="otpChannel"
                    value="email"
                    checked={formData.otpChannel === "email"}
                    onChange={handleChange}
                    className="sr-only"
                  />
                  Email
                </label>
                <label
                  className={`flex cursor-pointer items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                    formData.otpChannel === "sms"
                      ? "border-[#0A4D8C] bg-[#0A4D8C]/5 text-[#0A4D8C]"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="otpChannel"
                    value="sms"
                    checked={formData.otpChannel === "sms"}
                    onChange={handleChange}
                    className="sr-only"
                  />
                  SMS
                </label>
              </div>
            </div>

            {/* Customer Type */}
            <div>
              <label htmlFor="customerType" className="mb-2 block text-sm font-semibold text-slate-700">
                Account Type *
              </label>
              <select
                id="customerType"
                name="customerType"
                value={formData.customerType}
                onChange={handleChange}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-[#0A4D8C] focus:ring-4 focus:ring-[#0A4D8C]/10"
              >
                <option value="student">Student</option>
                <option value="public_traveler">Public Traveler</option>
              </select>
            </div>

            {/* Student-specific fields */}
            {formData.customerType === "student" && (
              <>
                <div>
                  <label htmlFor="studentId" className="mb-2 block text-sm font-semibold text-slate-700">
                    Student ID
                  </label>
                  <input
                    id="studentId"
                    name="studentId"
                    type="text"
                    value={formData.studentId}
                    onChange={handleChange}
                    placeholder="MZ123456"
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-[#0A4D8C] focus:ring-4 focus:ring-[#0A4D8C]/10"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="university" className="mb-2 block text-sm font-semibold text-slate-700">
                      University
                    </label>
                    <input
                      id="university"
                      name="university"
                      type="text"
                      value={formData.university}
                      onChange={handleChange}
                      placeholder="Mzuzu University"
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-[#0A4D8C] focus:ring-4 focus:ring-[#0A4D8C]/10"
                    />
                  </div>

                  <div>
                    <label htmlFor="programme" className="mb-2 block text-sm font-semibold text-slate-700">
                      Programme
                    </label>
                    <input
                      id="programme"
                      name="programme"
                      type="text"
                      value={formData.programme}
                      onChange={handleChange}
                      placeholder="Computer Science"
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-[#0A4D8C] focus:ring-4 focus:ring-[#0A4D8C]/10"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="faculty" className="mb-2 block text-sm font-semibold text-slate-700">
                      Faculty
                    </label>
                    <input
                      id="faculty"
                      name="faculty"
                      type="text"
                      value={formData.faculty}
                      onChange={handleChange}
                      placeholder="Engineering"
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-[#0A4D8C] focus:ring-4 focus:ring-[#0A4D8C]/10"
                    />
                  </div>

                  <div>
                    <label htmlFor="yearOfStudy" className="mb-2 block text-sm font-semibold text-slate-700">
                      Year of Study
                    </label>
                    <select
                      id="yearOfStudy"
                      name="yearOfStudy"
                      value={formData.yearOfStudy}
                      onChange={handleChange}
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-[#0A4D8C] focus:ring-4 focus:ring-[#0A4D8C]/10"
                    >
                      <option value="">Select year</option>
                      <option value="1">Year 1</option>
                      <option value="2">Year 2</option>
                      <option value="3">Year 3</option>
                      <option value="4">Year 4</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            {/* Password */}
            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-semibold text-slate-700">
                Password (min. 8 characters) *
              </label>
              <input
                id="password"
                name="password"
                type="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Enter a strong password"
                required
                minLength={8}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-[#0A4D8C] focus:ring-4 focus:ring-[#0A4D8C]/10"
              />
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="confirmPassword" className="mb-2 block text-sm font-semibold text-slate-700">
                Confirm Password *
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="Confirm your password"
                required
                minLength={8}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-[#0A4D8C] focus:ring-4 focus:ring-[#0A4D8C]/10"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-[#0A4D8C] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#083a6b] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Creating Account..." : "Create Account"}
            </button>
              </form>

              {/* Sign In Link */}
              <div className="mt-6 text-center">
                <p className="text-sm text-slate-600">
                  Already have an account?{" "}
                  <Link href="/customer/login" className="font-semibold text-[#0A4D8C] hover:text-[#083a6b]">
                    Sign in here
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
