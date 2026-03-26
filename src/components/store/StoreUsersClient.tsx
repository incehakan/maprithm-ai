"use client";

import { useEffect, useMemo, useState } from "react";
import { safeParseJsonResponse } from "@/lib/safeParseJsonResponse";

type RoleKey =
  | "owner"
  | "admin"
  | "editor"
  | "pricing_manager"
  | "order_manager"
  | "support"
  | "viewer"
  | "manager"
  | "staff";

type StoreUserRow = {
  membershipId: string;
  userId: string;
  name: string | null;
  email: string;
  roleKey: string;
  roleName: string;
  isActive: boolean;
  createdAt: string;
  overrides?: Record<string, boolean>;
};

type UsersResponse =
  | { success: true; users: StoreUserRow[] }
  | { success: false; error: string };

const PERMISSION_LABELS_TR: Record<string, string> = {
  "reports.view": "Raporları Görüntüle",
  "store.settings.manage": "Mağaza Ayarlarını Yönet"
};

const ROLE_OPTIONS: Array<{ key: RoleKey; label: string }> = [
  { key: "admin", label: "Admin" },
  { key: "editor", label: "Editor" },
  { key: "pricing_manager", label: "Pricing Manager" },
  { key: "order_manager", label: "Order Manager" },
  { key: "support", label: "Support" },
  { key: "viewer", label: "Viewer" }
];

export function StoreUsersClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<StoreUserRow[]>([]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [roleKey, setRoleKey] = useState<RoleKey>("viewer");
  const [adding, setAdding] = useState(false);

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => a.email.localeCompare(b.email));
  }, [users]);

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/store/users", { cache: "no-store" });
      const data = (await safeParseJsonResponse(res)) as UsersResponse | null;
      if (!res.ok) {
        setError((data as any)?.error ?? "Kullanıcılar alınamadı.");
        setUsers([]);
        return;
      }
      if (!data || data.success !== true) {
        setError((data as any)?.error ?? "Kullanıcılar alınamadı.");
        setUsers([]);
        return;
      }
      setUsers(data.users);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kullanıcılar alınamadı.");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  async function addUser() {
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/store/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, roleKey })
      });
      const data = await safeParseJsonResponse(res);
      if (!res.ok) {
        setError((data as any)?.error ?? "Kullanıcı eklenemedi.");
        return;
      }
      setName("");
      setEmail("");
      setPassword("");
      setRoleKey("viewer");
      await loadUsers();
    } finally {
      setAdding(false);
    }
  }

  async function updateRole(membershipId: string, nextRoleKey: RoleKey) {
    setError(null);
    const res = await fetch(`/api/store/users/${membershipId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roleKey: nextRoleKey })
    });
    const data = await safeParseJsonResponse(res);
    if (!res.ok) {
      setError((data as any)?.error ?? "Rol güncellenemedi.");
      return;
    }
    await loadUsers();
  }

  type OverrideMode = "inherit" | "allow" | "deny";
  function getMode(u: StoreUserRow, permissionKey: string): OverrideMode {
    const v = u.overrides?.[permissionKey];
    if (v === true) return "allow";
    if (v === false) return "deny";
    return "inherit";
  }

  async function updateOverride(
    membershipId: string,
    permissionKey: "reports.view" | "store.settings.manage",
    mode: OverrideMode
  ) {
    setError(null);
    const isAllowed = mode === "inherit" ? null : mode === "allow";
    const res = await fetch(`/api/store/users/${membershipId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        overrides: [{ permissionKey, isAllowed }]
      })
    });
    const data = await safeParseJsonResponse(res);
    if (!res.ok) {
      setError((data as any)?.error ?? "Override güncellenemedi.");
      return;
    }
    await loadUsers();
  }

  async function setActive(membershipId: string, active: boolean) {
    setError(null);
    const endpoint = active ? "activate" : "deactivate";
    const res = await fetch(`/api/store/users/${membershipId}/${endpoint}`, {
      method: "POST"
    });
    const data = await safeParseJsonResponse(res);
    if (!res.ok) {
      setError((data as any)?.error ?? "Güncellenemedi.");
      return;
    }
    await loadUsers();
  }

  const [pwMembershipId, setPwMembershipId] = useState<string | null>(null);
  const [pwValue, setPwValue] = useState("");
  const [pwLoading, setPwLoading] = useState(false);

  async function resetPassword() {
    if (!pwMembershipId) return;
    setError(null);
    setPwLoading(true);
    try {
      const res = await fetch(`/api/store/users/${pwMembershipId}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: pwValue })
      });
      const data = await safeParseJsonResponse(res);
      if (!res.ok) {
        setError((data as any)?.error ?? "Şifre sıfırlanamadı.");
        return;
      }
      setPwMembershipId(null);
      setPwValue("");
      await loadUsers();
    } finally {
      setPwLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mağaza Kullanıcıları</h1>
        <p className="mt-1 text-sm text-slate-400">
          Aktif mağazaya bağlı üyeleri yönetin.
        </p>
      </div>

      <div className="card">
        <div className="text-sm font-semibold text-slate-100">Kullanıcı ekle</div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="md:col-span-1">
            <label className="label" htmlFor="name">
              Ad soyad
            </label>
            <input
              id="name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ad Soyad"
            />
          </div>
          <div className="md:col-span-1">
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="kullanici@domain.com"
            />
          </div>
          <div>
            <label className="label" htmlFor="role">
              Rol
            </label>
            <select
              id="role"
              className="input"
              value={roleKey}
              onChange={(e) => setRoleKey(e.target.value as RoleKey)}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className="label" htmlFor="password">
              Şifre
            </label>
            <input
              id="password"
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
        </div>

        {error && <div className="mt-3 text-sm text-red-300">{error}</div>}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            className="btn-primary"
            disabled={adding || !name.trim() || !email.trim() || !password}
            onClick={() => void addUser()}
            type="button"
          >
            {adding ? "Ekleniyor..." : "Ekle"}
          </button>
        </div>
      </div>

      {pwMembershipId && (
        <div className="card">
          <div className="text-sm font-semibold text-slate-100">Şifre sıfırla</div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div className="md:col-span-2">
              <label className="label" htmlFor="pwNew">
                Yeni şifre
              </label>
              <input
                id="pwNew"
                className="input"
                type="password"
                value={pwValue}
                onChange={(e) => setPwValue(e.target.value)}
                placeholder="••••••••"
              />
              <div className="mt-1 text-xs text-slate-500">
                Not: Owner hesabı için şifre sıfırlama kapalıdır.
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
              onClick={() => {
                setPwMembershipId(null);
                setPwValue("");
              }}
              disabled={pwLoading}
            >
              Vazgeç
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => void resetPassword()}
              disabled={pwLoading || pwValue.length < 6}
            >
              {pwLoading ? "Kaydediliyor..." : "Şifreyi güncelle"}
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-100">Üyeler</div>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
            onClick={() => void loadUsers()}
            disabled={loading}
          >
            Yenile
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs text-slate-400">
              <tr>
                <th className="py-2">Kullanıcı</th>
                <th className="py-2">Email</th>
                <th className="py-2">Rol</th>
                <th className="py-2">Durum</th>
                <th className="py-2">Oluşturulma</th>
                <th className="py-2 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {sortedUsers.map((u) => (
                <tr key={u.membershipId}>
                  <td className="py-2 text-slate-100">{u.name ?? "—"}</td>
                  <td className="py-2 text-slate-200">{u.email}</td>
                  <td className="py-2">
                    <select
                      className="input h-9 py-0"
                      value={u.roleKey as RoleKey}
                      onChange={(e) =>
                        void updateRole(u.membershipId, e.target.value as RoleKey)
                      }
                      disabled={u.roleKey === "owner"}
                      title={u.roleKey === "owner" ? "Owner rolü değiştirilemez" : ""}
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r.key} value={r.key}>
                          {r.label}
                        </option>
                      ))}
                      {/* allow legacy roles to remain selectable */}
                      {u.roleKey === "owner" && <option value="owner">Owner</option>}
                      {u.roleKey === "manager" && <option value="manager">Manager</option>}
                      {u.roleKey === "staff" && <option value="staff">Staff</option>}
                    </select>

                    {u.roleKey === "admin" && (
                      <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                        <div>
                          <label className="label">
                            {PERMISSION_LABELS_TR["reports.view"]}
                          </label>
                          <select
                            className="input h-9 py-0"
                            value={getMode(u, "reports.view")}
                            onChange={(e) =>
                              void updateOverride(
                                u.membershipId,
                                "reports.view",
                                e.target.value as OverrideMode
                              )
                            }
                          >
                            <option value="inherit">Rolden Al (Varsayılan)</option>
                            <option value="allow">İzin Ver</option>
                            <option value="deny">Engelle</option>
                          </select>
                        </div>
                        <div>
                          <label className="label">
                            {PERMISSION_LABELS_TR["store.settings.manage"]}
                          </label>
                          <select
                            className="input h-9 py-0"
                            value={getMode(u, "store.settings.manage")}
                            onChange={(e) =>
                              void updateOverride(
                                u.membershipId,
                                "store.settings.manage",
                                e.target.value as OverrideMode
                              )
                            }
                          >
                            <option value="inherit">Rolden Al (Varsayılan)</option>
                            <option value="allow">İzin Ver</option>
                            <option value="deny">Engelle</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs ${
                        u.isActive
                          ? "bg-emerald-500/15 text-emerald-200"
                          : "bg-slate-700/50 text-slate-300"
                      }`}
                    >
                      {u.isActive ? "Aktif" : "Pasif"}
                    </span>
                  </td>
                  <td className="py-2 text-slate-300">{u.createdAt}</td>
                  <td className="py-2 text-right">
                    {u.roleKey !== "owner" && (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          className="inline-flex items-center justify-center rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
                          onClick={() => {
                            setPwMembershipId(u.membershipId);
                            setPwValue("");
                          }}
                        >
                          Şifre sıfırla
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center justify-center rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
                          onClick={() => void setActive(u.membershipId, !u.isActive)}
                        >
                          {u.isActive ? "Pasife al" : "Aktif et"}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && sortedUsers.length === 0 && (
                <tr>
                  <td className="py-4 text-slate-400" colSpan={6}>
                    Üye bulunamadı.
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td className="py-4 text-slate-400" colSpan={6}>
                    Yükleniyor...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

