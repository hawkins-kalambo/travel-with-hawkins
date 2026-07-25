"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/auth";
import { normalizeAdminRole } from "@/lib/adminAuth";

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<Array<{ id: string; email?: string | null; full_name?: string | null; role?: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const loadUsers = async () => {
      const res = await authFetch("/api/admin/users", { method: "GET" });
      if (res.status === 401) {
        router.replace("/admin/login");
        return;
      }

      if (!res.ok) {
        setMessage("You do not have permission to manage users.");
        setLoading(false);
        return;
      }

      const data = await res.json();
      setUsers(Array.isArray(data?.users) ? data.users : []);
      setLoading(false);
    };

    void loadUsers();
  }, [router]);

  const updateRole = async (targetId: string, role: string) => {
    setSaving(targetId);
    const res = await authFetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetId, role }),
    });

    if (!res.ok) {
      setMessage("Unable to update the selected user role.");
      setSaving(null);
      return;
    }

    setMessage("User role updated successfully.");
    setUsers((current) => current.map((user) => (user.id === targetId ? { ...user, role } : user)));
    setSaving(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-5xl rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#0A4D8C]">User Management</p>
            <h1 className="text-2xl font-black text-slate-900">Assign roles</h1>
          </div>
        </div>

        {message ? <p className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">{message}</p> : null}

        {loading ? (
          <p className="text-sm text-slate-600">Loading users...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600">
                  <th className="px-3 py-3">Name</th>
                  <th className="px-3 py-3">Email</th>
                  <th className="px-3 py-3">Current role</th>
                  <th className="px-3 py-3">Change role</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-slate-100">
                    <td className="px-3 py-3">{user.full_name || "—"}</td>
                    <td className="px-3 py-3">{user.email || "—"}</td>
                    <td className="px-3 py-3">{normalizeAdminRole(user.role)}</td>
                    <td className="px-3 py-3">
                      <select
                        defaultValue={normalizeAdminRole(user.role)}
                        onChange={(event) => void updateRole(user.id, event.target.value)}
                        className="rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                        disabled={saving === user.id}
                      >
                        <option value="super_admin">Super Admin</option>
                        <option value="admin">Admin</option>
                        <option value="viewer">Viewer</option>
                        <option value="ambassador">Ambassador</option>
                        <option value="customer">Customer</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
