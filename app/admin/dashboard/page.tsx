"use client";

import { Suspense } from "react";
import AdminPage from "../page";

export default function AdminDashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f4f8fd]" />}> 
      <AdminPage />
    </Suspense>
  );
}
