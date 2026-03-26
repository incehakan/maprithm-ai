import { redirect } from "next/navigation";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { StorePermissionsClient } from "@/components/store/StorePermissionsClient";

export default async function StorePermissionsPage() {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e) {
    if (e instanceof Error && e.message === "NO_ACTIVE_STORE") {
      redirect("/register-store");
    }
    redirect("/login");
  }

  try {
    requirePermission(ctx, "store.rbac.manage");
  } catch {
    return (
      <div className="card">
        <div className="text-sm font-semibold text-slate-100">
          Bu sayfaya erişim yetkiniz yok
        </div>
        <div className="mt-2 text-sm text-slate-300">
          Gerekli izin:{" "}
          <code className="text-slate-100">store.rbac.manage</code>
          <p className="mt-2 text-slate-500">
            Varsayılan olarak yalnızca mağaza sahibi (owner) bu ekrana erişir. Owner,
            bu izni kullanıcı özel yetkiler sekmesinden devredebilir.
          </p>
        </div>
      </div>
    );
  }

  return <StorePermissionsClient actorRoleKey={ctx.roleKey} />;
}
