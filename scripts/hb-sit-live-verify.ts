/**
 * Hepsiburada SIT canlı doğrulama.
 *
 * Önkoşul: MarketplaceConnection platform=hepsiburada, environment=test, isActive.
 * Çalıştır: npx tsx scripts/hb-sit-live-verify.ts
 *
 * Çıktı: stdout JSON özeti + docs altına yazılmaz (manuel SYNC/DOGRULAMA güncellemesi).
 * Production endpoint'lerine ASLA istek atmaz (yalnızca test connection).
 */

import { PrismaClient } from "@prisma/client";
import { fetchHbPackagesPage } from "../src/lib/hepsiburadaOrderSync";
import { getHbMerchantId } from "../src/lib/hepsiburadaFetch";
import {
  fetchHbOrdersAll,
  fetchHbOrdersCancelled,
  fetchHbOrdersPaymentAwaiting,
  fetchHbPackagesDelivered,
  fetchHbPackagesMissingInvoice,
  fetchHbPackagesShipped,
  fetchHbPackagesUndelivered,
  fetchHbPackagesUnpacked,
} from "../src/lib/hepsiburadaStatusFeeds";
import {
  createHbTestQuestion,
  fetchHbAskToSellerIssues,
  fetchHbAskToSellerIssuesCount,
} from "../src/lib/hepsiburadaAskToSeller";
import { searchHbListingUpdateRequests, searchHbSupplierListings, searchHbOpenPurchaseOrders } from "../src/lib/hepsiburadaSupplier";
import { fetchHbCargoFirms, createHbShippingProfile } from "../src/lib/hepsiburadaCargoProfiles";
import {
  updateHbParcelInfo,
  updateHbPackageWarehouse,
  splitHbPackage,
  updateHbLineItemLaborCost,
} from "../src/lib/hepsiburadaPackageOps";
import { hbFetch, hbPostJson, hbPutJson } from "../src/lib/hepsiburadaFetch";

const prisma = new PrismaClient();

type Probe = { name: string; ok: boolean; status?: number; detail: string };

async function main() {
  const conn = await prisma.marketplaceConnection.findFirst({
    where: { platform: "hepsiburada", isActive: true, environment: "test" },
    orderBy: { updatedAt: "desc" },
  });

  if (!conn) {
    const anyHb = await prisma.marketplaceConnection.findFirst({
      where: { platform: "hepsiburada" },
      select: { environment: true, isActive: true },
    });
    console.error(
      JSON.stringify(
        {
          fatal: true,
          reason: "NO_HB_SIT_CONNECTION",
          message:
            "Aktif Hepsiburada SIT (environment=test) bağlantısı yok. " +
            "Ayarlar → Hepsiburada'dan test ortamı kaydı gerekli.",
          anyHbConnection: anyHb,
        },
        null,
        2
      )
    );
    process.exit(2);
  }

  const storeId = conn.storeId;
  const merchantId = await getHbMerchantId(storeId);
  const probes: Probe[] = [];

  // ── 1) Sync A/B ──────────────────────────────────────────────────────────
  try {
    const page = await fetchHbPackagesPage({
      storeId,
      merchantId,
      offset: 0,
      limit: 5,
    });
    probes.push({
      name: "sync_old_packages_query",
      ok: true,
      detail: `count=${page.packages.length} totalCount=${page.totalCount}`,
    });
  } catch (e) {
    probes.push({
      name: "sync_old_packages_query",
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  const feeds: Array<[string, () => Promise<{ ok: true; data: unknown } | { ok: false; message: string }>]> = [
    ["feed_all", () => fetchHbOrdersAll({ storeId, offset: 0, limit: 5 })],
    ["feed_cancelled", () => fetchHbOrdersCancelled({ storeId, offset: 0, limit: 5 })],
    ["feed_paymentawaiting", () => fetchHbOrdersPaymentAwaiting({ storeId, offset: 0, limit: 5 })],
    ["feed_delivered", () => fetchHbPackagesDelivered({ storeId, offset: 0, limit: 5 })],
    ["feed_missing_invoice", () => fetchHbPackagesMissingInvoice({ storeId, offset: 0, limit: 5 })],
    ["feed_shipped", () => fetchHbPackagesShipped({ storeId, offset: 0, limit: 5 })],
    ["feed_unpacked", () => fetchHbPackagesUnpacked({ storeId, offset: 0, limit: 5 })],
    ["feed_undelivered", () => fetchHbPackagesUndelivered({ storeId, offset: 0, limit: 5 })],
  ];

  for (const [name, fn] of feeds) {
    const r = await fn();
    probes.push({
      name,
      ok: r.ok,
      detail: r.ok
        ? `dataType=${Array.isArray(r.data) ? "array" : typeof r.data}`
        : r.message,
    });
  }

  // ── 2) Ask-to-seller auth + POST /issues ─────────────────────────────────
  {
    const list = await fetchHbAskToSellerIssues({ storeId });
    probes.push({
      name: "asktoseller_issues_get",
      ok: list.ok,
      detail: list.ok ? "ok" : list.message,
    });
    const count = await fetchHbAskToSellerIssuesCount({ storeId });
    probes.push({
      name: "asktoseller_count",
      ok: count.ok,
      detail: count.ok ? "ok" : count.message,
    });
    const postRes = await createHbTestQuestion({
      storeId,
      payload: { productSku: "SIT-PROBE-SKU", question: "maprithm sit probe — ignore" },
    });
    probes.push({
      name: "asktoseller_create_test_question",
      ok: postRes.ok,
      detail: postRes.ok
        ? JSON.stringify(postRes.data).slice(0, 300)
        : postRes.message,
    });
  }

  // ── 3) Supplier /search method ───────────────────────────────────────────
  for (const [name, fn] of [
    ["supplier_listing_update_search", () => searchHbListingUpdateRequests({ storeId, filter: {} })],
    ["supplier_listings_search", () => searchHbSupplierListings({ storeId, filter: {} })],
    ["supplier_open_po_search", () => searchHbOpenPurchaseOrders({ storeId, filter: {} })],
  ] as const) {
    const r = await fn();
    probes.push({
      name,
      ok: r.ok,
      detail: r.ok ? `items=${r.items.length}` : r.message,
    });
  }

  // ── 4) Cargo firms + profile create minimal ──────────────────────────────
  {
    const firms = await fetchHbCargoFirms({ storeId });
    probes.push({
      name: "cargo_firms",
      ok: firms.ok,
      detail: firms.ok ? "ok" : firms.message,
    });
    const create = await createHbShippingProfile({
      storeId,
      payload: { name: "maprithm-sit-probe-do-not-use" },
    });
    probes.push({
      name: "shipping_profile_create_minimal",
      ok: create.ok,
      detail: create.ok
        ? JSON.stringify(create.data).slice(0, 300)
        : create.message,
    });
  }

  // ── 5) Package ops — dummy packageNumber (expect 404/400 with field hints)
  {
    const dummyPkg = "SIT-PROBE-INVALID-PKG";
    const parcel = await updateHbParcelInfo({
      storeId,
      packageNumber: dummyPkg,
      body: { desi: 1, width: 10, height: 10, length: 10 },
    });
    probes.push({
      name: "parcel_info_dummy",
      ok: parcel.ok,
      detail: parcel.ok ? "unexpected ok" : parcel.message,
    });
    const wh = await updateHbPackageWarehouse({
      storeId,
      packageNumber: dummyPkg,
      body: { warehouseId: "SIT-PROBE-WH" },
    });
    probes.push({
      name: "warehouse_dummy",
      ok: wh.ok,
      detail: wh.ok ? "unexpected ok" : wh.message,
    });
    const split = await splitHbPackage({
      storeId,
      packageNumber: dummyPkg,
      body: { lineItems: [] },
    });
    probes.push({
      name: "split_dummy",
      ok: split.ok,
      detail: split.ok ? "unexpected ok" : split.message,
    });
    const labor = await updateHbLineItemLaborCost({
      storeId,
      orderLineId: "00000000-0000-0000-0000-000000000000",
      body: { laborCost: 1 },
    });
    probes.push({
      name: "laborcost_dummy",
      ok: labor.ok,
      detail: labor.ok ? "unexpected ok" : labor.message,
    });
  }

  // ── 6) Catalog placeholders — skip (HB_UNVERIFIED throw only)
  probes.push({
    name: "catalog_placeholders",
    ok: false,
    detail: "HB_UNVERIFIED — canlı body denemesi riskli; HB desteği / Try It! gerekli",
  });

  // ── 7) Listings bulk-unlock / mapping — skip write
  probes.push({
    name: "listings_unlock_mapping",
    ok: false,
    detail: "HB_UNVERIFIED write — şema yokken canlı yazma atlandı",
  });

  // unused imports keep tree for future probes
  void hbFetch;
  void hbPostJson;
  void hbPutJson;

  console.log(
    JSON.stringify(
      {
        storeId,
        merchantId: merchantId.slice(0, 8) + "…",
        environment: conn.environment,
        probes,
        summary: {
          ok: probes.filter((p) => p.ok).length,
          fail: probes.filter((p) => !p.ok).length,
        },
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
