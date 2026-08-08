"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/auth";
import { normalizeAdminRole } from "@/lib/adminAuth";

type ManagedUser = {
  id: string;
  email?: string | null;
  full_name?: string | null;
  role?: string | null;
  universityIds?: string[];
};

type UniversityOption = { id: string; name: string; short_code?: string | null; status?: string | null };

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [universities, setUniversities] = useState<UniversityOption[]>([]);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, string>>({});
  const [universityDrafts, setUniversityDrafts] = useState<Record<string, string[]>>({});
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
      const loadedUsers = Array.isArray(data?.users) ? data.users as ManagedUser[] : [];
      setUsers(loadedUsers);
      setUniversities(Array.isArray(data?.universities) ? data.universities : []);
      setRoleDrafts(Object.fromEntries(loadedUsers.map((user) => [user.id, normalizeAdminRole(user.role)])));
      setUniversityDrafts(Object.fromEntries(loadedUsers.map((user) => [user.id, user.universityIds ?? []])));
      setLoading(false);
    };

    void loadUsers();
  }, [router]);

  const updateRole = async (targetId: string) => {
    const role = roleDrafts[targetId] ?? "customer";
    const universityIds = universityDrafts[targetId] ?? [];
    if (role === "university_admin" && universityIds.length === 0) {
      setMessage("Select at least one university for this administrator.");
      return;
    }
    setSaving(targetId);
    const res = await authFetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetId, role, universityIds }),
    });

    if (!res.ok) {
      setMessage("Unable to update the selected user role.");
      setSaving(null);
      return;
    }

    setMessage("User role updated successfully.");
    setUsers((current) => current.map((user) => (
      user.id === targetId ? { ...user, role, universityIds: role === "university_admin" ? universityIds : [] } : user
    )));
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
                  <th className="px-3 py-3">University access</th>
                  <th className="px-3 py-3">Save</th>
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
                        value={roleDrafts[user.id] ?? normalizeAdminRole(user.role)}
                        onChange={(event) => setRoleDrafts((current) => ({ ...current, [user.id]: event.target.value }))}
                        className="rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                        disabled={saving === user.id}
                      >
                        <option value="super_admin">Super Admin</option>
                        <option value="admin">Admin</option>
                        <option value="university_admin">University Admin</option>
                        <option value="viewer">Viewer</option>
                        <option value="ambassador">Ambassador</option>
                        <option value="customer">Customer</option>
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      {(roleDrafts[user.id] ?? normalizeAdminRole(user.role)) === "university_admin" ? (
                        <select
                          multiple
                          value={universityDrafts[user.id] ?? []}
                          onChange={(event) => {
                            const selected = Array.from(event.currentTarget.selectedOptions, (option) => option.value);
                            setUniversityDrafts((current) => ({ ...current, [user.id]: selected }));
                          }}
                          className="min-h-24 min-w-56 rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                          disabled={saving === user.id}
                          aria-label={`Universities assigned to ${user.full_name || user.email || "user"}`}
                        >
                          {universities.map((university) => (
                            <option key={university.id} value={university.id}>
                              {university.name}{university.status === "inactive" ? " (inactive)" : ""}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-slate-500">Global or non-admin role</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => void updateRole(user.id)}
                        disabled={saving === user.id}
                        className="rounded-xl bg-[#0A4D8C] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {saving === user.id ? "Saving..." : "Save"}
                      </button>
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
