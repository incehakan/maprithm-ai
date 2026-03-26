"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { safeParseJsonResponse } from "@/lib/safeParseJsonResponse";

type PermissionCatalogItem = {
  key: string;
  name: string;
  labelTr: string;
};

type RoleCell = {
  mode: "inherit" | "grant" | "deny";
  global: boolean;
};

type RoleMatrixRow = {
  key: string;
  name: string;
  permissions: Record<string, RoleCell>;
};

type MemberRow = {
  membershipId: string;
  email: string;
  name: string | null;
  roleKey: string;
  roleName: string;
  isActive: boolean;
  effectivePermissionKeys: string[];
  overrides: Record<string, boolean>;
};

type RbacResponse = {
  success: true;
  actorRoleKey: string;
  permissionCatalog: PermissionCatalogItem[];
  roleMatrix: RoleMatrixRow[];
  members: MemberRow[];
};

type Props = {
  actorRoleKey: string;
};

function buildMemberDraft(
  overrides: Record<string, boolean>,
  catalog: PermissionCatalogItem[]
): Record<string, "inherit" | "grant" | "deny"> {
  const d: Record<string, "inherit" | "grant" | "deny"> = {};
  for (const p of catalog) {
    if (p.key in overrides) {
      d[p.key] = overrides[p.key] ? "grant" : "deny";
    } else {
      d[p.key] = "inherit";
    }
  }
  return d;
}

export function StorePermissionsClient({ actorRoleKey }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [data, setData] = useState<RbacResponse | null>(null);
  const [tab, setTab] = useState<"roles" | "members">("roles");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/store/rbac", {
        cache: "no-store",
        credentials: "include"
      });
      const json = (await safeParseJsonResponse(res)) as
        | RbacResponse
        | { success?: boolean; error?: string }
        | null;
      if (!json) {
        setError(
          `Sunucu yanıtı okunamadı (HTTP ${res.status}). Ağ veya sunucu loglarını kontrol edin.`
        );
        setData(null);
        return;
      }
      if (!res.ok || json.success !== true) {
        const msg =
          typeof (json as { error?: string }).error === "string"
            ? (json as { error: string }).error
            : `İstek başarısız (HTTP ${res.status}).`;
        setError(msg);
        setData(null);
        return;
      }
      setData(json as RbacResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hata");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function patchRole(
    roleKey: string,
    permissionKey: string,
    mode: "inherit" | "grant" | "deny"
  ) {
    const key = `${roleKey}:${permissionKey}`;
    setSaving(key);
    setError(null);
    try {
      const res = await fetch("/api/store/rbac/roles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleKey, permissionKey, mode })
      });
      const json = await safeParseJsonResponse(res);
      if (!res.ok) {
        setError((json as { error?: string })?.error ?? "Kaydedilemedi.");
        return;
      }
      await load();
    } finally {
      setSaving(null);
    }
  }

  async function saveMemberOverrides(
    membershipId: string,
    rows: Array<{ permissionKey: string; isAllowed: boolean | null }>
  ) {
    setSaving(`m:${membershipId}`);
    setError(null);
    try {
      const res = await fetch(`/api/store/rbac/memberships/${membershipId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides: rows })
      });
      const json = await safeParseJsonResponse(res);
      if (!res.ok) {
        setError((json as { error?: string })?.error ?? "Kaydedilemedi.");
        return;
      }
      await load();
    } finally {
      setSaving(null);
    }
  }

  if (loading && !data) {
    return (
      <div className="text-sm text-slate-400">Yetki verileri yükleniyor…</div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-lg border border-red-800 bg-red-950/30 p-4 text-sm text-red-200">
        {error ?? "Yüklenemedi."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-100">
          Yetki ve menü yönetimi
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Bu mağaza için rol bazlı izinleri ve kullanıcı özel izinlerini yönetin.
          {actorRoleKey === "owner" ? (
            <span className="block mt-1 text-amber-200/90">
              Mağaza sahibi olarak &quot;Yetki ve menü yönetimi&quot; iznini
              başka kullanıcılara özel izin sekmesinden devredebilirsiniz.
            </span>
          ) : null}
        </p>
      </div>

      {error ? (
        <div
          className="rounded-lg border border-amber-700/50 bg-amber-950/20 px-4 py-3 text-sm text-amber-100"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <div className="flex gap-2 border-b border-slate-800 pb-2">
        <button
          type="button"
          onClick={() => setTab("roles")}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${
            tab === "roles"
              ? "bg-indigo-600 text-white"
              : "text-slate-300 hover:bg-slate-800"
          }`}
        >
          Rol yetkileri
        </button>
        <button
          type="button"
          onClick={() => setTab("members")}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${
            tab === "members"
              ? "bg-indigo-600 text-white"
              : "text-slate-300 hover:bg-slate-800"
          }`}
        >
          Kullanıcı özel yetkiler
        </button>
      </div>

      {tab === "roles" ? (
        <div className="card overflow-x-auto p-0">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs uppercase text-slate-500">
                <th className="sticky left-0 z-10 bg-slate-900 px-3 py-3">İzin</th>
                {data.roleMatrix.map((r) => (
                  <th key={r.key} className="whitespace-nowrap px-3 py-3 text-slate-300">
                    {r.name}
                    <span className="ml-1 font-normal text-slate-500">({r.key})</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {data.permissionCatalog.map((p) => (
                <tr key={p.key} className="hover:bg-slate-900/50">
                  <td className="sticky left-0 z-10 bg-slate-950/95 px-3 py-2 text-slate-200">
                    <div className="font-medium text-slate-100">{p.labelTr}</div>
                    <div className="font-mono text-[10px] text-slate-500">{p.key}</div>
                  </td>
                  {data.roleMatrix.map((rm) => {
                    const cell = rm.permissions[p.key];
                    if (!cell) {
                      return (
                        <td key={rm.key} className="px-3 py-2">
                          —
                        </td>
                      );
                    }
                    const busy = saving === `${rm.key}:${p.key}`;
                    return (
                      <td key={rm.key} className="px-3 py-2">
                        <select
                          disabled={busy}
                          className="w-full max-w-[140px] rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200"
                          value={cell.mode}
                          onChange={(e) => {
                            const v = e.target.value as "inherit" | "grant" | "deny";
                            void patchRole(rm.key, p.key, v);
                          }}
                          title={
                            cell.global
                              ? "Sistem varsayılanı: var"
                              : "Sistem varsayılanı: yok"
                          }
                        >
                          <option value="inherit">
                            Varsayılan{cell.global ? " ✓" : " · yok"}
                          </option>
                          <option value="grant">İzin ver</option>
                          <option value="deny">Engelle</option>
                        </select>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-6">
          {data.members.map((m) => (
            <MemberOverridesCard
              key={m.membershipId}
              member={m}
              catalog={data.permissionCatalog}
              actorRoleKey={actorRoleKey}
              busy={saving === `m:${m.membershipId}`}
              onSave={(rows) => saveMemberOverrides(m.membershipId, rows)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MemberOverridesCard({
  member,
  catalog,
  actorRoleKey,
  busy,
  onSave
}: {
  member: MemberRow;
  catalog: PermissionCatalogItem[];
  actorRoleKey: string;
  busy: boolean;
  onSave: (rows: Array<{ permissionKey: string; isAllowed: boolean | null }>) => void;
}) {
  const catalogForEdit = useMemo(
    () =>
      catalog.filter(
        (p) => actorRoleKey === "owner" || p.key !== "store.rbac.manage"
      ),
    [catalog, actorRoleKey]
  );

  const [draft, setDraft] = useState<Record<string, "inherit" | "grant" | "deny">>(() =>
    buildMemberDraft(member.overrides, catalogForEdit)
  );

  useEffect(() => {
    setDraft(buildMemberDraft(member.overrides, catalogForEdit));
  }, [member.membershipId, member.overrides, catalogForEdit]);

  if (member.roleKey === "owner") {
    return (
      <div className="card border-slate-700">
        <div className="text-sm font-semibold text-slate-100">{member.email}</div>
        <div className="mt-1 text-xs text-slate-500">Owner — özel izin uygulanmaz.</div>
      </div>
    );
  }

  function toOverridesPayload(): Array<{ permissionKey: string; isAllowed: boolean | null }> {
    return catalogForEdit.map((p) => {
      const mode = draft[p.key] ?? "inherit";
      return {
        permissionKey: p.key,
        isAllowed: mode === "inherit" ? null : mode === "grant"
      };
    });
  }

  const dirty =
    JSON.stringify(draft) !==
    JSON.stringify(buildMemberDraft(member.overrides, catalogForEdit));

  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-100">
            {member.name ?? member.email}{" "}
            <span className="font-normal text-slate-500">({member.email})</span>
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Rol: {member.roleName}{" "}
            <span className="text-slate-500">· {member.roleKey}</span>
            {!member.isActive ? (
              <span className="ml-2 text-amber-400">Pasif üyelik</span>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          disabled={busy || !dirty}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
          onClick={() => onSave(toOverridesPayload())}
        >
          {busy ? "Kaydediliyor…" : "Değişiklikleri kaydet"}
        </button>
      </div>

      <p className="text-xs text-slate-500">
        &quot;Varsayılan&quot; = rol + bu sayfadaki rol matrisi. &quot;İzin ver&quot; /
        &quot;Engelle&quot; = yalnızca bu kullanıcıya ek kural.
        {actorRoleKey !== "owner" ? (
          <span className="block text-amber-200/80">
            &quot;Yetki ve menü yönetimi&quot; iznini yalnızca mağaza sahibi
            devredebilir.
          </span>
        ) : null}
      </p>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {catalogForEdit.map((p) => (
          <label
            key={p.key}
            className="flex flex-col gap-1 rounded-lg border border-slate-800 bg-slate-900/40 p-2"
          >
            <span className="text-xs text-slate-400">{p.labelTr}</span>
            <select
              disabled={busy}
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 disabled:opacity-40"
              value={draft[p.key] ?? "inherit"}
              onChange={(e) => {
                const v = e.target.value as "inherit" | "grant" | "deny";
                setDraft((prev) => ({ ...prev, [p.key]: v }));
              }}
            >
              <option value="inherit">Varsayılan (rol)</option>
              <option value="grant">İzin ver</option>
              <option value="deny">Engelle</option>
            </select>
          </label>
        ))}
      </div>

      <details className="text-xs text-slate-500">
        <summary className="cursor-pointer text-slate-400">Etkin izin listesi</summary>
        <pre className="mt-2 max-h-40 overflow-auto rounded border border-slate-800 p-2 text-[10px] text-slate-400">
          {member.effectivePermissionKeys.join(", ")}
        </pre>
      </details>
    </div>
  );
}
