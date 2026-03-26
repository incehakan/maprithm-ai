"use client";

import Link from "next/link";
import { PermissionGate } from "@/components/auth/PermissionGate";

export function ProductsPageToolbar() {
  return (
    <div className="flex gap-2">
      <PermissionGate permission="products.create">
        <Link
          href="/products/import"
          className="inline-flex items-center justify-center rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
        >
          CSV İçe Aktar
        </Link>
      </PermissionGate>
      <PermissionGate permission="products.create">
        <Link href="/products/new" className="btn-primary">
          Yeni ürün
        </Link>
      </PermissionGate>
    </div>
  );
}
