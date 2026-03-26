import { redirect } from "next/navigation";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { StoreUsersClient } from "@/components/store/StoreUsersClient";

export default async function StoreUsersPage() {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch {
    redirect("/login");
  }

  try {
    requirePermission(ctx, "store.users.manage");
  } catch {
    return (
      <div className="card">
        <div className="text-sm font-semibold text-slate-100">
          Bu sayfaya erişim yetkiniz yok
        </div>
        <div className="mt-2 text-sm text-slate-300">
          Gerekli izin:{" "}
          <code className="text-slate-100">store.users.manage</code>
        </div>
      </div>
    );
  }

  return <StoreUsersClient />;
}

