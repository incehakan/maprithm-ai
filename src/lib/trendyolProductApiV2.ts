import {
  trendyolDelete,
  trendyolFetch,
  trendyolPostJson,
  trendyolPutJson
} from "@/lib/trendyolFetch";
import { buildTrendyolV2Path } from "@/lib/trendyolPartnerApiV2";
import { getTrendyolStorefrontCode } from "@/lib/trendyolShipmentPackages";

type SellerScopedInput = {
  userId: string;
  storeId: string;
  sellerId: string;
};

export async function publishProductToTrendyolV2(
  input: SellerScopedInput & { body: unknown }
) {
  const path = buildTrendyolV2Path("createProducts", { sellerId: input.sellerId });
  return trendyolPostJson<unknown>(
    input.userId,
    input.storeId,
    path,
    input.body
  );
}

export async function updateUnapprovedProductsOnTrendyol(
  input: SellerScopedInput & { body: unknown }
) {
  const path = buildTrendyolV2Path("updateUnapprovedProducts", {
    sellerId: input.sellerId
  });
  return trendyolPostJson<unknown>(
    input.userId,
    input.storeId,
    path,
    input.body
  );
}

export async function updateApprovedProductContentOnTrendyol(
  input: SellerScopedInput & { body: unknown }
) {
  const path = buildTrendyolV2Path("updateApprovedProductContent", {
    sellerId: input.sellerId
  });
  return trendyolPostJson<unknown>(
    input.userId,
    input.storeId,
    path,
    input.body
  );
}

export async function updateApprovedProductVariantOnTrendyol(
  input: SellerScopedInput & { body: unknown }
) {
  const path = buildTrendyolV2Path("updateApprovedProductVariant", {
    sellerId: input.sellerId
  });
  return trendyolPostJson<unknown>(
    input.userId,
    input.storeId,
    path,
    input.body
  );
}

export async function updateApprovedProductDeliveryOnTrendyol(
  input: SellerScopedInput & { body: unknown }
) {
  const path = buildTrendyolV2Path("updateApprovedProductDelivery", {
    sellerId: input.sellerId
  });
  return trendyolPostJson<unknown>(
    input.userId,
    input.storeId,
    path,
    input.body
  );
}

export async function deleteTrendyolProductsV2(
  input: SellerScopedInput & { barcodes: string[] }
) {
  const path = buildTrendyolV2Path("deleteProducts", { sellerId: input.sellerId });
  const items = input.barcodes
    .map((b) => b.trim())
    .filter(Boolean)
    .map((barcode) => ({ barcode }));
  return trendyolDelete<unknown>(input.userId, input.storeId, path, {
    body: { items },
    extraHeaders: { storeFrontCode: getTrendyolStorefrontCode() }
  });
}

export async function archiveProductOnTrendyolV2(
  input: SellerScopedInput & { barcode: string; archived: boolean }
) {
  const path = buildTrendyolV2Path("archiveProducts", { sellerId: input.sellerId });
  return trendyolPutJson<unknown>(input.userId, input.storeId, path, {
    items: [{ barcode: input.barcode, archived: input.archived }]
  });
}

export async function unlockTrendyolProduct(
  input: SellerScopedInput & { barcodes: string[] }
) {
  const path = buildTrendyolV2Path("unlockProducts", { sellerId: input.sellerId });
  const items = input.barcodes
    .map((b) => b.trim())
    .filter(Boolean)
    .map((barcode) => ({ barcode }));
  return trendyolPutJson<unknown>(input.userId, input.storeId, path, { items });
}

export async function getTrendyolProductBase(
  input: SellerScopedInput & { barcode: string }
) {
  const path = buildTrendyolV2Path("getProductBase", {
    sellerId: input.sellerId,
    barcode: input.barcode
  });
  return trendyolFetch<unknown>(input.userId, input.storeId, path);
}

export async function filterApprovedProductsOnTrendyol(
  input: SellerScopedInput & { query?: string }
) {
  const q = input.query?.trim() ? `?${input.query.trim().replace(/^\?/, "")}` : "?page=0&size=1";
  const path = `${buildTrendyolV2Path("filterApprovedProducts", {
    sellerId: input.sellerId
  })}${q}`;
  return trendyolFetch<unknown>(input.userId, input.storeId, path);
}

export async function filterUnapprovedProductsOnTrendyol(
  input: SellerScopedInput & { query?: string }
) {
  const q = input.query?.trim() ? `?${input.query.trim().replace(/^\?/, "")}` : "?page=0&size=1";
  const path = `${buildTrendyolV2Path("filterUnapprovedProducts", {
    sellerId: input.sellerId
  })}${q}`;
  return trendyolFetch<unknown>(input.userId, input.storeId, path);
}

/** getProductBase yanıtından contentId çıkarır */
export function parseTrendyolContentIdFromProductBase(data: unknown): number | null {
  if (data == null || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  const direct = Number(o.contentId);
  if (Number.isFinite(direct) && direct > 0) return Math.round(direct);
  const content = o.content;
  if (content && typeof content === "object") {
    const cid = Number((content as Record<string, unknown>).contentId);
    if (Number.isFinite(cid) && cid > 0) return Math.round(cid);
  }
  return null;
}
