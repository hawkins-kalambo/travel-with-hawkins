"use client";

import { useEffect, useState } from "react";

type Alert = {
  id: string;
  message: string;
  type: "success" | "info" | "warning" | "error";
};

export default function AdminNotification() {
  const [alert, setAlert] = useState<Alert | null>(null);

  // Demo trigger (replace later with Supabase realtime)
  useEffect(() => {
    const timer = setTimeout(() => {
      setAlert({
        id: "1",
        message: "🚍 New booking received in system",
        type: "info",
      });
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  const closeAlert = () => {
    setAlert(null);
  };

  if (!alert) return null;

  return (
    <div className="fixed top-4 right-4 z-50">
      <div
        className={`
          px-4 py-3 rounded-lg shadow-lg text-white text-sm flex items-start justify-between gap-3
          ${
            alert.type === "success"
              ? "bg-green-600"
              : alert.type === "warning"
              ? "bg-yellow-600"
              : alert.type === "error"
              ? "bg-red-600"
              : "bg-blue-600"
          }
        `}
      >
        <span>{alert.message}</span>

        <button onClick={closeAlert} className="ml-2 text-white/80 hover:text-white">
          ✕
        </button>
      </div>
    </div>
  );
}