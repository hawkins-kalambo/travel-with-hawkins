"use client";

import { useEffect, useState } from "react";

type Notification = {
  id: string;
  message: string;
  type: "success" | "info" | "warning" | "error";
};

export default function BookingNotification() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Demo: simulate incoming booking alerts
  useEffect(() => {
    const demoNotifications: Notification[] = [
      {
        id: "1",
        message: "🆕 New booking received from student",
        type: "info",
      },
      {
        id: "2",
        message: "💰 Payment confirmed for Trip MZ-LIL-001",
        type: "success",
      },
    ];

    // avoid setState during effect render phase by scheduling in microtask
    queueMicrotask(() => setNotifications(demoNotifications));




    // auto remove notifications
    const timer = setTimeout(() => {
      setNotifications([]);
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  const removeNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  if (notifications.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 space-y-2 z-50 w-80">
      {notifications.map((n) => (
        <div
          key={n.id}
          className="bg-white border border-gray-200 shadow-lg rounded-lg p-3 text-sm flex justify-between items-start"
        >
          <p className="text-slate-700">{n.message}</p>

          <button
            onClick={() => removeNotification(n.id)}
            className="text-gray-400 hover:text-gray-700 ml-3"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}