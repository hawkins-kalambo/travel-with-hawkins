"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = () => {
    if (username === "admin" && password === "1234") {
      localStorage.setItem("auth", "true");
      router.push("/admin");
    } else {
      alert("Invalid login details");
    }
  };

  return (
    <div className="min-h-screen flex">

      {/* ================= LEFT PANEL (DESKTOP BRANDING) ================= */}
      <div className="hidden md:flex w-1/2 bg-blue-950 text-white flex-col justify-center items-center p-10">

        <Image
          src="/logo.png"
          width={112}
          height={112}
          className="object-contain mb-6"
          alt="Travel with Hawkins Logo"
        />

        <h1 className="text-3xl font-bold text-center">
          Travel with Hawkins
        </h1>

        <p className="text-sm text-blue-200 mt-2 text-center max-w-xs">
          Student Transport Management System for safe and reliable journeys
        </p>

        <div className="mt-10 text-center text-xs text-blue-300 space-y-2">
          <p>✔ Secure Admin Access</p>
          <p>✔ Real-time Booking Control</p>
          <p>✔ Trip Management Dashboard</p>
        </div>
      </div>

      {/* ================= RIGHT PANEL (LOGIN FORM) ================= */}
      <div className="flex-1 flex items-center justify-center bg-slate-100 px-6">

        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8">

          {/* MOBILE LOGO */}
          <div className="flex flex-col items-center mb-6 md:hidden">
            <Image
              src="/logo.png"
              width={64}
              height={64}
              className="object-contain mb-2"
              alt="Travel with Hawkins Logo"
            />

            <h1 className="text-lg font-bold text-blue-900">
              Travel with Hawkins
            </h1>
          </div>

          <h2 className="text-2xl font-bold text-blue-900 mb-1">
            Admin Login
          </h2>

          <p className="text-sm text-gray-500 mb-6">
            Enter your credentials to access dashboard
          </p>

          {/* USERNAME */}
          <div className="mb-4">
            <label className="text-sm text-gray-600">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* PASSWORD */}
          <div className="mb-6">
            <label className="text-sm text-gray-600">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* LOGIN BUTTON */}
          <button
            onClick={handleLogin}
            className="w-full bg-blue-900 hover:bg-blue-800 text-white py-2 rounded-lg font-semibold transition"
          >
            Login to Dashboard
          </button>

          <p className="text-xs text-center text-gray-400 mt-6">
            Secure Transport Management System
          </p>

        </div>
      </div>
    </div>
  );
}