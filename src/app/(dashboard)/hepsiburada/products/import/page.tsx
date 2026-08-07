"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ClientPagePermissionGuard } from "@/components/auth/ClientPagePermissionGuard";
import { HepsiburadaProductImportForm } from "@/components/hepsiburada/HepsiburadaProductImportForm";
import { Skeleton } from "@/components/ui/skeleton";

function ImportPageContent() {
  const [merchantId, setMerchantId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/integrations/hepsiburada/connection");
        const data = await res.json().catch(() => null);
        setMerchantId(String(data?.connection?.merchantId ?? ""));
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Hepsiburada Ürün İçe Aktarma</h1>
          <p className="mt-1 text-sm text-slate-400">
            Katalog import (multipart JSON) — merchant:{" "}
            <code className="text-slate-300">{merchantId || "—"}</code>
          </p>
        </div>
        <Link href="/hepsiburada/products" className="text-sm text-indigo-400 hover:underline">
          ← Ürün listesi
        </Link>
      </div>
      <HepsiburadaProductImportForm merchantId={merchantId} />
    </div>
  );
}

export default function HepsiburadaProductImportPage() {
  return (
    <ClientPagePermissionGuard permission="marketplace.publish">
      <ImportPageContent />
    </ClientPagePermissionGuard>
  );
}
