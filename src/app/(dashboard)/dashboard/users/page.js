"use client";

import { useState, useEffect } from "react";
import { Card, Button } from "@/shared/components";

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUser, setNewUser] = useState({ email: "", name: "", role: "member" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users");
      if (res.status === 403) {
        setError("Admin access required to manage users.");
        return;
      }
      if (!res.ok) throw new Error("Failed to load users");
      const data = await res.json();
      setUsers(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newUser.email) return;
    setSaving(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create user");
      setShowAddModal(false);
      setNewUser({ email: "", name: "", role: "member" });
      await fetchUsers();
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateRole = async (userId, role) => {
    const res = await fetch(`/api/users/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (res.ok) {
      await fetchUsers();
    } else {
      const data = await res.json();
      alert(data.error || "Failed to update role");
    }
  };

  const handleToggleActive = async (user) => {
    const res = await fetch(`/api/users/${user.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: user.isActive ? 0 : 1 }),
    });
    if (res.ok) await fetchUsers();
  };

  const handleDelete = async (userId) => {
    if (!confirm("Delete this user? This cannot be undone.")) return;
    const res = await fetch(`/api/users/${userId}`, { method: "DELETE" });
    if (res.ok) {
      await fetchUsers();
    } else {
      const data = await res.json();
      alert(data.error || "Failed to delete user");
    }
  };

  const roleBadge = (role) => {
    const styles = {
      admin: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
      member: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
      viewer: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
    };
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[role] || styles.viewer}`}>
        {role}
      </span>
    );
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Users</h1>
        <Button
          onClick={() => setShowAddModal(true)}
          icon="person_add"
        >
          Add User
        </Button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-error/10 text-error rounded-lg text-sm">{error}</div>
      )}

      <Card>
        {loading ? (
          <div className="py-8 text-center text-text-muted text-sm">Loading...</div>
        ) : users.length === 0 ? (
          <div className="py-8 text-center text-text-muted text-sm">No users yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-muted text-left">
                  <th className="pb-2 pr-4 font-medium">Email</th>
                  <th className="pb-2 pr-4 font-medium">Name</th>
                  <th className="pb-2 pr-4 font-medium">Role</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 pr-4 font-medium">Last Login</th>
                  <th className="pb-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-border/50 last:border-0">
                    <td className="py-3 pr-4">{user.email}</td>
                    <td className="py-3 pr-4 text-text-muted">{user.name || "—"}</td>
                    <td className="py-3 pr-4">
                      <select
                        value={user.role}
                        onChange={(e) => handleUpdateRole(user.id, e.target.value)}
                        className="text-xs border rounded px-1.5 py-1 bg-surface-secondary border-border"
                      >
                        <option value="admin">admin</option>
                        <option value="member">member</option>
                        <option value="viewer">viewer</option>
                      </select>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${user.isActive ? "bg-success/10 text-success" : "bg-error/10 text-error"}`}>
                        {user.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-text-muted">
                      {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleActive(user)}
                          className="text-xs text-text-muted hover:text-text-main px-2 py-1 border border-border rounded"
                        >
                          {user.isActive ? "Disable" : "Enable"}
                        </button>
                        <button
                          onClick={() => handleDelete(user.id)}
                          className="text-xs text-error hover:bg-error/10 px-2 py-1 border border-error/30 rounded"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div role="dialog" aria-modal="true" aria-labelledby="add-user-title" className="bg-surface rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h2 id="add-user-title" className="text-lg font-semibold mb-4">Add User</h2>
            <div className="flex flex-col gap-3">
              <div>
                <label htmlFor="new-user-email" className="block text-sm font-medium mb-1">Email *</label>
                <input
                  id="new-user-email"
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))}
                  placeholder="user@example.com"
                  className="w-full px-3 py-2 border rounded-lg bg-surface-secondary border-border text-sm"
                />
              </div>
              <div>
                <label htmlFor="new-user-name" className="block text-sm font-medium mb-1">Name</label>
                <input
                  id="new-user-name"
                  type="text"
                  value={newUser.name}
                  onChange={(e) => setNewUser((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Full name"
                  className="w-full px-3 py-2 border rounded-lg bg-surface-secondary border-border text-sm"
                />
              </div>
              <div>
                <label htmlFor="new-user-role" className="block text-sm font-medium mb-1">Role</label>
                <select
                  id="new-user-role"
                  value={newUser.role}
                  onChange={(e) => setNewUser((p) => ({ ...p, role: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg bg-surface-secondary border-border text-sm"
                >
                  <option value="member">Member</option>
                  <option value="viewer">Viewer</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-surface-hover"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={saving || !newUser.email}
                className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
