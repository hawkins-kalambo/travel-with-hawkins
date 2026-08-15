"use client";

import { FormEvent, useEffect, useState } from "react";
import { authFetch } from "@/lib/auth";

type StaffMember = {
  id: string;
  userId: string;
  staffRole: string;
  status: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
};

const STAFF_ROLES = [
  { value: "manager", label: "Manager" },
  { value: "dispatcher", label: "Dispatcher" },
  { value: "finance_officer", label: "Finance officer" },
  { value: "booking_agent", label: "Booking agent" },
  { value: "driver", label: "Driver" },
  { value: "owner", label: "Owner" },
];

export default function StaffPanel({ ownStaffRole }: { ownStaffRole: string }) {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [newPassword, setNewPassword] = useState<{ email: string; password: string } | null>(null);

  const [form, setForm] = useState({ fullName: "", email: "", phone: "", staffRole: "dispatcher" });

  const load = async () => {
    const response = await authFetch("/api/operators/staff");
    const result = await response.json();
    if (result.success) setStaff(result.staff);
    setLoaded(true);
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setNewPassword(null);

    const response = await authFetch("/api/operators/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const result = await response.json();

    if (!result.success) {
      setError(result.error || "Failed to invite staff member");
      return;
    }

    setNewPassword({ email: form.email, password: result.temporaryPassword });
    setForm({ fullName: "", email: "", phone: "", staffRole: "dispatcher" });
    await load();
  };

  const updateMember = async (id: string, payload: Record<string, unknown>) => {
    setError("");
    const response = await authFetch(`/api/operators/staff/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!result.success) {
      setError(result.error || "Action failed");
      return;
    }
    await load();
  };

  return (
    <div className="mt-6 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <h2 className="text-lg font-bold text-slate-900">Staff</h2>
      <p className="mt-1 text-sm text-slate-600">Invite people to help run your operator account.</p>

      {error && <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {newPassword && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">
            Account created for {newPassword.email}. Share this temporary password with them directly — it won&apos;t be shown
            again:
          </p>
          <p className="mt-1 font-mono text-base">{newPassword.password}</p>
        </div>
      )}

      <form onSubmit={invite} className="mt-4 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-end">
        <input
          className="input-field w-full sm:w-auto"
          placeholder="Full name"
          required
          value={form.fullName}
          onChange={(e) => setForm({ ...form, fullName: e.target.value })}
        />
        <input
          type="email"
          className="input-field w-full sm:w-auto"
          placeholder="Email"
          required
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <input
          className="input-field w-full sm:w-auto"
          placeholder="Phone"
          required
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
        <select className="input-field w-full sm:w-auto" value={form.staffRole} onChange={(e) => setForm({ ...form, staffRole: e.target.value })}>
          {STAFF_ROLES.filter((role) => role.value !== "owner" || ownStaffRole === "owner").map((role) => (
            <option key={role.value} value={role.value}>
              {role.label}
            </option>
          ))}
        </select>
        <button type="submit" className="btn-primary w-full sm:w-auto">
          Invite
        </button>
      </form>

      <div className="mt-4 space-y-2">
        {!loaded && <p className="text-sm text-slate-500">Loading staff…</p>}
        {loaded && staff.length === 0 && <p className="text-sm text-slate-500">No staff yet.</p>}
        {staff.map((member) => {
          const canManageThis = ownStaffRole === "owner" || member.staffRole !== "owner";
          return (
            <div key={member.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-100 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{member.fullName ?? member.email}</p>
                <p className="text-xs capitalize text-slate-500">
                  {member.staffRole.replace(/_/g, " ")} · {member.email}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                    member.status === "active" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
                  }`}
                >
                  {member.status}
                </span>
                {canManageThis && (
                  <button
                    onClick={() => updateMember(member.id, { status: member.status === "active" ? "suspended" : "active" })}
                    className="btn-secondary px-3 py-1 text-xs"
                  >
                    {member.status === "active" ? "Suspend" : "Reactivate"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
