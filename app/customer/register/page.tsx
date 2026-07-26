"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

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
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
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
        }),
      });

      const result = await response.json();

      if (!result.success) {
        setError(result.error || "Registration failed");
        setLoading(false);
        return;
      }

      setSuccessMessage(result.message || "Registration successful! Please check your email to verify your account.");
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
      });

      setTimeout(() => {
        router.push("/customer/login?registered=true");
      }, 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-3">
            <Image src="/logo.png" width={48} height={48} className="rounded-full object-cover" alt="Travel with Hawkins logo" />
            <span className="text-2xl font-black text-[#0A4D8C]">Travel with Hawkins</span>
          </Link>
          <h1 className="mt-6 text-3xl font-black text-slate-900 sm:text-4xl">Create Your Account</h1>
          <p className="mt-2 text-lg text-slate-600">Join us today and start booking your trips</p>
        </div>

        {/* Registration Form Card */}
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-lg sm:p-10">
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
  );
}
