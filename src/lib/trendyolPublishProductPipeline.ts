import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { createActivityLog } from "@/lib/activityLog";
import { getUserSettings } from "@/lib/userSettings";
import { buildMarketplaceImages } from "@/lib/productImages";
import {
  buildTrendyolCreateProductBody,
  buildTrendyolCreateProductBodyV2,
  buildTrendyolApprovedContentUpdateItemV2,
  buildTrendyolUnapprovedUpdateItemV2,
  extractBatchRequestId,
  resolveTrendyolCommercials,
  type BuildTrendyolProductPayloadInput
} from "@/lib/trendyolCreateProductPayload";
import { evaluateTrendyolPublishReadiness } from "@/lib/trendyolMappingReadiness";
import { canPublishProduct } from "@/lib/productLifecycle";
import { publishProductToTrendyol } from "@/lib/trendyolPublishProduct";
import {
  deleteTrendyolProductsOnTrendyol,
  updateProductOnTrendyol
} from "@/lib/trendyolProductMutations";
import {
  deleteTrendyolProductsV2,
  getTrendyolProductBase,
  parseTrendyolContentIdFromProductBase,
  publishProductToTrendyolV2,
  updateApprovedProductContentOnTrendyol,
  updateUnapprovedProductsOnTrendyol
} from "@/lib/trendyolProductApiV2";
import { isStoreProductV2Enabled } from "@/lib/trendyolStoreProductV2";
import type { ProductMarketplaceMapping } from "@prisma/client";
import { buildPublishBatchResult } from "@/lib/trendyol/publish/buildPublishBatchResult";
import { createPublishPayloadHash } from "@/lib/trendyol/publish/createPublishPayloadHash";
import { mapTrendyolErrorToInternalCode } from "@/lib/trendyol/publish/mapTrendyolErrorToInternalCode";
import { parseTrendyolPublishResponse } from "@/lib/trendyol/publish/parseTrendyolPublishResponse";
import {
  markPublishAttemptPending,
  persistPublishItemResults,
  persistPublishValidationFailure
} from "@/lib/trendyol/publish/persistPublishItemResults";
import type { PublishBatchResult, PublishItemResult } from "@/lib/trendyol/publish/types";
import {
  TrendyolPrePublishErrorCode,
  TrendyolPublishRuntimeErrorCode
} from "@/lib/validation/trendyolPublishErrorCodes";
import { secureProductMarketplaceMappingUpdateMany } from "@/lib/security/storeScope";
import { isFeatureEnabled, FEATURE_FLAGS } from "@/lib/featureFlags";
import { categoryRequiresOrigin } from "@/lib/trendyolOriginRequired";

export type TrendyolPublishPipelineResult =
  | {
      ok: true;
      batchRequestId: string | null;
      publishStatus: string;
      batch: PublishBatchResult;
      message: string;
    }
  | {
      ok: false;
      error: string;
      httpStatus: number;
      missing?: string[];
      batch?: PublishBatchResult;
    };

type TrendyolPublishPipelineFailure = Extract<TrendyolPublishPipelineResult, { ok: false }>;

type MappingWithAttrs = ProductMarketplaceMapping & {
  attributes: Array<{
    attributeId: number;
    attributeValueId: number | null;
    customValue: string | null;
  }>;
};

type PublishProductFn = (input: {
  userId: string;
  storeId: string;
  sellerId: string;
  body: unknown;
}) => ReturnType<typeof publishProductToTrendyol>;

function allowPublishGate(
  product: { lifecycleStatus: string | null; stock: number },
  mapping: MappingWithAttrs,
  contentRepublishMode: boolean
): TrendyolPublishPipelineFailure | null {
  const lifecycle = String(product.lifecycleStatus ?? "").toLowerCase();
  const mapStatus = String(mapping.publishStatus ?? "").toLowerCase();

  if (mapStatus === "archived" || lifecycle === "archived") {
    return {
      ok: false,
      httpStatus: 400,
      error: "Arşivdeki ürünler yeniden publish edilmez."
    };
  }

  if (contentRepublishMode) {
    if (mapStatus !== "published") {
      return {
        ok: false,
        httpStatus: 400,
        error: "İçerik yenileme yalnızca yayında olan ürünler için."
      };
    }
    if ((product.stock ?? 0) <= 0) {
      return {
        ok: false,
        httpStatus: 400,
        error: "Stok 0 iken Trendyol içerik güncellemesi yapılamaz."
      };
    }
    return null;
  }

  if (!canPublishProduct(product, mapping as never)) {
    return {
      ok: false,
      httpStatus: 400,
      error: "Ürün mevcut yaşam döngüsü durumunda yayınlanamaz."
    };
  }

  return null;
}

/**
 * Trendyol ürün publish HTTP route ile aynı iş akışı (XML senkronundan da kullanılır).
 */
export async function runTrendyolProductPublishPipeline(input: {
  userId: string;
  storeId: string;
  membershipId: string | null;
  productId: string;
  /** XML içerik değişimi: canPublish "published" ürünü hariç tutmasın */
  contentRepublishMode?: boolean;
  /** V2 onaysız içerik güncelleme — flag açık mağazada */
  trendyolV2Operation?: "createProducts" | "updateUnapprovedProducts";
  publishProduct?: PublishProductFn;
  skipActivityLog?: boolean;
}): Promise<TrendyolPublishPipelineResult> {
  const publishFn = input.publishProduct ?? publishProductToTrendyol;
  const contentRepublishMode = input.contentRepublishMode === true;
  const v2Op = input.trendyolV2Operation;
  const productV2Enabled =
    v2Op != null ||
    (!contentRepublishMode && (await isStoreProductV2Enabled(input.storeId)));

  const product = await prisma.product.findFirst({
    where: { id: input.productId, userId: input.userId, storeId: input.storeId }
  });

  if (!product) {
    return { ok: false, httpStatus: 404, error: "Ürün bulunamadı." };
  }

  const mappingRow = await prisma.productMarketplaceMapping.findUnique({
    where: {
      productId_platform: { productId: input.productId, platform: "trendyol" }
    },
    include: { attributes: true }
  });

  if (!mappingRow) {
    return { ok: false, httpStatus: 400, error: "Trendyol eşleştirmesi bulunamadı." };
  }
  if (mappingRow.storeId !== input.storeId) {
    return { ok: false, httpStatus: 403, error: "Yetkisiz." };
  }

  const gate = allowPublishGate(product, mappingRow as MappingWithAttrs, contentRepublishMode);
  if (gate) {
    await persistPublishValidationFailure({
      storeId: input.storeId,
      mappingId: mappingRow.id,
      code: TrendyolPublishRuntimeErrorCode.TRENDYOL_PUBLISH_GATE_BLOCKED,
      message: gate.error
    });
    return {
      ok: false,
      httpStatus: gate.httpStatus,
      error: gate.error,
      batch: buildPublishBatchResult([
        {
          productId: input.productId,
          mappingId: mappingRow.id,
          barcode: (mappingRow.barcode as string | null) ?? undefined,
          status: "FAILED",
          errorCode: TrendyolPublishRuntimeErrorCode.TRENDYOL_PUBLISH_GATE_BLOCKED,
          errorMessage: gate.error
        }
      ])
    };
  }

  const conn = await prisma.marketplaceConnection.findUnique({
    where: { storeId_platform: { storeId: input.storeId, platform: "trendyol" } }
  });

  if (!conn?.isActive) {
    const msg = "Aktif Trendyol bağlantısı yok.";
    await persistPublishValidationFailure({
      storeId: input.storeId,
      mappingId: mappingRow.id,
      code: TrendyolPrePublishErrorCode.TRENDYOL_CONNECTION_INACTIVE,
      message: msg
    });
    return {
      ok: false,
      httpStatus: 400,
      error: msg,
      batch: buildPublishBatchResult([
        {
          productId: input.productId,
          mappingId: mappingRow.id,
          barcode: (mappingRow.barcode as string | null) ?? undefined,
          status: "FAILED",
          errorCode: TrendyolPrePublishErrorCode.TRENDYOL_CONNECTION_INACTIVE,
          errorMessage: msg
        }
      ])
    };
  }

  const sellerId = String(conn.sellerId).trim();
  if (!sellerId) {
    const msg = "Satıcı ID (Seller ID) tanımlı değil.";
    await persistPublishValidationFailure({
      storeId: input.storeId,
      mappingId: mappingRow.id,
      code: TrendyolPrePublishErrorCode.TRENDYOL_SELLER_ID_MISSING,
      message: msg
    });
    return {
      ok: false,
      httpStatus: 400,
      error: msg,
      batch: buildPublishBatchResult([
        {
          productId: input.productId,
          mappingId: mappingRow.id,
          barcode: (mappingRow.barcode as string | null) ?? undefined,
          status: "FAILED",
          errorCode: TrendyolPrePublishErrorCode.TRENDYOL_SELLER_ID_MISSING,
          errorMessage: msg
        }
      ])
    };
  }

  const shipmentAddressId = conn.shipmentAddressId?.trim();
  const returnAddressId = conn.returnAddressId?.trim();
  if (!shipmentAddressId || !returnAddressId) {
    const msg = "Trendyol adresi seçilmeden ürün gönderilemez.";
    await persistPublishValidationFailure({
      storeId: input.storeId,
      mappingId: mappingRow.id,
      code: TrendyolPrePublishErrorCode.TRENDYOL_ADDRESSES_MISSING,
      message: msg
    });
    return {
      ok: false,
      httpStatus: 400,
      error: msg,
      missing: [
        ...(shipmentAddressId ? [] : ["Gönderim (sevkiyat) adresi"]),
        ...(returnAddressId ? [] : ["İade adresi"])
      ],
      batch: buildPublishBatchResult([
        {
          productId: input.productId,
          mappingId: mappingRow.id,
          barcode: (mappingRow.barcode as string | null) ?? undefined,
          status: "FAILED",
          errorCode: TrendyolPrePublishErrorCode.TRENDYOL_ADDRESSES_MISSING,
          errorMessage: msg
        }
      ])
    };
  }

  const categoryId = mappingRow.trendyolCategoryId as number | null;
  if (categoryId == null) {
    const msg = "Trendyol kategori seçilmemiş.";
    await persistPublishValidationFailure({
      storeId: input.storeId,
      mappingId: mappingRow.id,
      code: TrendyolPrePublishErrorCode.TRENDYOL_CATEGORY_MISSING,
      message: msg
    });
    return {
      ok: false,
      httpStatus: 400,
      error: msg,
      missing: ["Trendyol kategori"],
      batch: buildPublishBatchResult([
        {
          productId: input.productId,
          mappingId: mappingRow.id,
          barcode: (mappingRow.barcode as string | null) ?? undefined,
          status: "FAILED",
          errorCode: TrendyolPrePublishErrorCode.TRENDYOL_CATEGORY_MISSING,
          errorMessage: msg
        }
      ])
    };
  }

  const catAttrs = await prisma.trendyolCategoryAttribute.findMany({
    where: { categoryId },
    select: {
      attributeId: true,
      attributeName: true,
      isRequired: true
    },
    orderBy: { attributeName: "asc" }
  });

  const defs = catAttrs.map((a) => ({
    attributeId: a.attributeId,
    attributeName: a.attributeName,
    isRequired: Boolean(a.isRequired)
  }));

  const savedAttrs = mappingRow.attributes.map((a) => ({
    attributeId: a.attributeId,
    attributeValueId: a.attributeValueId,
    customValue: a.customValue
  }));

  const settings = await getUserSettings({ userId: input.userId, storeId: input.storeId });
  const store = await prisma.store.findUnique({
    where: { id: input.storeId },
    select: { featureFlags: true }
  });
  const originFieldEnabled = store
    ? isFeatureEnabled(store, FEATURE_FLAGS.ORIGIN_FIELD)
    : false;
  const p = product as typeof product & {
    imageUrls?: unknown;
    vatRate?: number | null;
    origin?: string | null;
  };
  const useProductPrice = (mappingRow.useProductPrice as boolean | null) !== false;
  const useProductStock = (mappingRow.useProductStock as boolean | null) !== false;
  const resolvedCommercials = resolveTrendyolCommercials({
    product: {
      id: product.id,
      name: product.name,
      description: product.description,
      stock: product.stock,
      price: Number(product.price)
    },
    mapping: {
      barcode: mappingRow.barcode as string | null,
      stockCode: mappingRow.stockCode as string | null,
      productMainId: mappingRow.productMainId as string | null,
      trendyolBrandId: mappingRow.trendyolBrandId as number | null,
      trendyolCategoryId: mappingRow.trendyolCategoryId as number | null,
      quantity: mappingRow.quantity as number | null,
      dimensionalWeight: mappingRow.dimensionalWeight as number | null,
      currencyType: mappingRow.currencyType as string | null,
      listPrice: mappingRow.listPrice as number | null,
      salePrice: mappingRow.salePrice as number | null,
      vatRate: mappingRow.vatRate as number | null,
      cargoCompanyId: mappingRow.cargoCompanyId as number | null,
      useProductPrice,
      useProductStock,
      mainImageUrl: mappingRow.mainImageUrl as string | null,
      imageUrls: (mappingRow.imageUrls as unknown) ?? p.imageUrls ?? null
    },
    mappingAttributes: [],
    fallbackVatRate: settings.defaultVatRate ?? 20,
    shipmentAddressId,
    returnAddressId
  });

  const publishCheck = evaluateTrendyolPublishReadiness(
    {
      trendyolBrandId: mappingRow.trendyolBrandId as number | null,
      trendyolCategoryId: mappingRow.trendyolCategoryId as number | null,
      barcode: mappingRow.barcode as string | null,
      stockCode: mappingRow.stockCode as string | null,
      productMainId: mappingRow.productMainId as string | null,
      salePrice: resolvedCommercials.salePrice,
      quantity: resolvedCommercials.quantity,
      mainImageUrl: mappingRow.mainImageUrl as string | null,
      imageUrls: (mappingRow.imageUrls as unknown) ?? p.imageUrls ?? null,
      cargoCompanyId: mappingRow.cargoCompanyId as number | null,
      listPrice: resolvedCommercials.listPrice
    },
    defs,
    savedAttrs,
    { price: Number(product.price), stock: product.stock }
  );

  if (!publishCheck.ready) {
    const msg = `Yayına hazırlık kontrolü başarısız. ${publishCheck.missing.join(" · ")}`;
    await persistPublishValidationFailure({
      storeId: input.storeId,
      mappingId: mappingRow.id,
      code: TrendyolPublishRuntimeErrorCode.TRENDYOL_PUBLISH_VALIDATION_FAILED,
      message: msg
    });
    return {
      ok: false,
      httpStatus: 400,
      error: "Yayına hazırlık kontrolü başarısız.",
      missing: publishCheck.missing,
      batch: buildPublishBatchResult([
        {
          productId: input.productId,
          mappingId: mappingRow.id,
          barcode: (mappingRow.barcode as string | null) ?? undefined,
          status: "FAILED",
          errorCode: TrendyolPublishRuntimeErrorCode.TRENDYOL_PUBLISH_VALIDATION_FAILED,
          errorMessage: msg
        }
      ])
    };
  }

  if (
    originFieldEnabled &&
    categoryRequiresOrigin(defs) &&
    !String(p.origin ?? "").trim()
  ) {
    const msg = "Bu kategori için menşei (origin) zorunludur.";
    await persistPublishValidationFailure({
      storeId: input.storeId,
      mappingId: mappingRow.id,
      code: TrendyolPrePublishErrorCode.TRENDYOL_ORIGIN_MISSING,
      message: msg
    });
    return {
      ok: false,
      httpStatus: 400,
      error: msg,
      missing: ["Menşei (origin)"],
      batch: buildPublishBatchResult([
        {
          productId: input.productId,
          mappingId: mappingRow.id,
          barcode: (mappingRow.barcode as string | null) ?? undefined,
          status: "FAILED",
          errorCode: TrendyolPrePublishErrorCode.TRENDYOL_ORIGIN_MISSING,
          errorMessage: msg
        }
      ])
    };
  }

  const fallbackVat =
    mappingRow.vatRate != null && Number.isFinite(mappingRow.vatRate)
      ? mappingRow.vatRate
      : p.vatRate != null && Number.isFinite(p.vatRate)
        ? p.vatRate
        : settings.defaultVatRate ?? 20;

  let body: unknown;
  const payloadInput: BuildTrendyolProductPayloadInput = {
    product: {
      id: product.id,
      name: product.name,
      description: product.description,
      stock: product.stock,
      price: Number(product.price)
    },
    mapping: {
      barcode: mappingRow.barcode as string | null,
      stockCode: mappingRow.stockCode as string | null,
      productMainId: mappingRow.productMainId as string | null,
      trendyolBrandId: mappingRow.trendyolBrandId as number | null,
      trendyolCategoryId: mappingRow.trendyolCategoryId as number | null,
      quantity: mappingRow.quantity as number | null,
      dimensionalWeight: mappingRow.dimensionalWeight as number | null,
      currencyType: mappingRow.currencyType as string | null,
      listPrice: mappingRow.listPrice as number | null,
      salePrice: mappingRow.salePrice as number | null,
      useProductPrice,
      vatRate: mappingRow.vatRate as number | null,
      cargoCompanyId: mappingRow.cargoCompanyId as number | null,
      useProductStock,
      mainImageUrl: mappingRow.mainImageUrl as string | null,
      imageUrls: (mappingRow.imageUrls as unknown) ?? p.imageUrls ?? null
    },
    mappingAttributes: savedAttrs,
    fallbackVatRate: fallbackVat,
    shipmentAddressId,
    returnAddressId,
    productOrigin: p.origin ?? null,
    includeOriginField: originFieldEnabled
  };
  try {
    if (productV2Enabled && v2Op === "updateUnapprovedProducts") {
      body = { items: [buildTrendyolUnapprovedUpdateItemV2(payloadInput)] };
    } else if (productV2Enabled) {
      body = buildTrendyolCreateProductBodyV2(payloadInput);
    } else {
      body = buildTrendyolCreateProductBody(payloadInput);
    }
  } catch (e) {
    console.error("buildTrendyolCreateProductBody error:", e);
    const msg = e instanceof Error ? e.message : "Payload oluşturulamadı.";
    await persistPublishValidationFailure({
      storeId: input.storeId,
      mappingId: mappingRow.id,
      code: TrendyolPublishRuntimeErrorCode.TRENDYOL_PUBLISH_PAYLOAD_BUILD_FAILED,
      message: msg
    });
    return {
      ok: false,
      httpStatus: 400,
      error: msg,
      batch: buildPublishBatchResult([
        {
          productId: input.productId,
          mappingId: mappingRow.id,
          barcode: (mappingRow.barcode as string | null) ?? undefined,
          status: "FAILED",
          errorCode: TrendyolPublishRuntimeErrorCode.TRENDYOL_PUBLISH_PAYLOAD_BUILD_FAILED,
          errorMessage: msg
        }
      ])
    };
  }

  const correlationBatchId = randomUUID();
  const payloadHash = createPublishPayloadHash(body);
  await markPublishAttemptPending({
    storeId: input.storeId,
    mappingId: mappingRow.id,
    payloadHash,
    correlationBatchId
  });

  if (!input.skipActivityLog) {
    await createActivityLog({
      userId: input.userId,
      storeId: input.storeId,
      membershipId: input.membershipId ?? undefined,
      action: "TRENDYOL_PUBLISH_BATCH_STARTED",
      entityType: "product",
      entityId: input.productId,
      message: `Trendyol publish batch başladı · storeId=${input.storeId} · userId=${input.userId} · productId=${input.productId} · mappingId=${mappingRow.id} · correlation=${correlationBatchId}`
    });
  }

  const apiResult = await (productV2Enabled
    ? v2Op === "updateUnapprovedProducts"
      ? updateUnapprovedProductsOnTrendyol({
          userId: input.userId,
          storeId: input.storeId,
          sellerId,
          body
        })
      : publishProductToTrendyolV2({
          userId: input.userId,
          storeId: input.storeId,
          sellerId,
          body
        })
    : publishFn({
        userId: input.userId,
        storeId: input.storeId,
        sellerId,
        body
      }));

  let itemResult: PublishItemResult;

  if (!apiResult.ok) {
    const duplicateBarcode =
      /ayn[iı]\s+barkod/i.test(apiResult.message) ||
      /already exists/i.test(apiResult.message);
    const friendlyError = duplicateBarcode
      ? "Barkod çakışması veya mevcut kayıt."
      : apiResult.message;
    const code = mapTrendyolErrorToInternalCode(friendlyError);

    itemResult = {
      productId: input.productId,
      mappingId: mappingRow.id,
      barcode: (mappingRow.barcode as string | null) ?? undefined,
      status: "FAILED",
      errorCode: code,
      errorMessage: friendlyError
    };
  } else {
    itemResult = parseTrendyolPublishResponse({
      httpOk: true,
      httpStatus: apiResult.status,
      data: apiResult.data,
      context: {
        productId: input.productId,
        mappingId: mappingRow.id,
        barcode: mappingRow.barcode as string | null,
        stockCode: mappingRow.stockCode as string | null,
        productMainId: mappingRow.productMainId as string | null
      }
    });
  }

  await persistPublishItemResults({
    storeId: input.storeId,
    results: [itemResult],
    correlationBatchId
  });

  const batch = buildPublishBatchResult([itemResult]);

  if (!input.skipActivityLog) {
    if (itemResult.status === "FAILED") {
      await createActivityLog({
        userId: input.userId,
        storeId: input.storeId,
        membershipId: input.membershipId ?? undefined,
        action: "TRENDYOL_PUBLISH_ITEM_FAILED",
        entityType: "product",
        entityId: input.productId,
        message: `Trendyol publish ürün başarısız · storeId=${input.storeId} · userId=${input.userId} · productId=${input.productId} · mappingId=${mappingRow.id} · barcode=${itemResult.barcode ?? ""} · batchRequestId=${itemResult.batchRequestId ?? correlationBatchId} · status=FAILED · errorCode=${itemResult.errorCode ?? ""} · ${(itemResult.errorMessage ?? "").slice(0, 240)}`
      });
    } else {
      await createActivityLog({
        userId: input.userId,
        storeId: input.storeId,
        membershipId: input.membershipId ?? undefined,
        action: "TRENDYOL_PUBLISH_ITEM_SUCCEEDED",
        entityType: "product",
        entityId: input.productId,
        message: `Trendyol publish ürün tamamlandı · storeId=${input.storeId} · userId=${input.userId} · productId=${input.productId} · mappingId=${mappingRow.id} · barcode=${itemResult.barcode ?? ""} · batchRequestId=${itemResult.batchRequestId ?? correlationBatchId} · status=${itemResult.status}`
      });
    }
    await createActivityLog({
      userId: input.userId,
      storeId: input.storeId,
      membershipId: input.membershipId ?? undefined,
      action: "TRENDYOL_PUBLISH_BATCH_COMPLETED",
      entityType: "product",
      entityId: input.productId,
      message: `Trendyol publish batch bitti · storeId=${input.storeId} · userId=${input.userId} · productId=${input.productId} · total=${batch.total} · success=${batch.success} · failed=${batch.failed} · pending=${batch.pending}`
    });
  }

  if (itemResult.status === "FAILED") {
    return {
      ok: false,
      httpStatus: !apiResult.ok
        ? apiResult.status >= 400
          ? apiResult.status
          : 502
        : 400,
      error: itemResult.errorMessage ?? "Trendyol gönderimi başarısız oldu.",
      batch
    };
  }

  const batchRequestId =
    itemResult.batchRequestId ?? (apiResult.ok ? extractBatchRequestId(apiResult.data) : null);

  await prisma.product.updateMany({
    where: { id: input.productId, userId: input.userId, storeId: input.storeId },
    data: { lifecycleStatus: "ready" }
  });

  if (batchRequestId) {
    try {
      await prisma.trendyolPublishJob.upsert({
        where: {
          storeId_batchRequestId: { storeId: input.storeId, batchRequestId }
        },
        create: {
          userId: input.userId,
          storeId: input.storeId,
          batchRequestId,
          platform: "trendyol",
          batchStatus: "IN_PROGRESS",
          itemCount: 1,
          successCount: 0,
          failedCount: 0,
          pendingCount: 1,
          batchRequestType: contentRepublishMode ? "ProductUpdate" : "ProductPublish",
          lastSyncMessage: "Ürün Trendyol kuyruğuna alındı."
        },
        update: {
          batchStatus: "IN_PROGRESS",
          itemCount: 1,
          pendingCount: 1,
          batchRequestType: contentRepublishMode ? "ProductUpdate" : "ProductPublish",
          lastSyncMessage: "Ürün Trendyol kuyruğuna alındı."
        }
      });
    } catch (e) {
      console.warn("trendyolPublishJob upsert skipped:", e);
    }
  }

  const publishStatus =
    itemResult.status === "SUCCESS"
      ? "published"
      : batchRequestId
        ? "sent"
        : "processing";

  const message =
    itemResult.status === "PENDING"
      ? "İstek Trendyol kuyruğuna alındı. Batch sonucunu kontrol edin."
      : itemResult.status === "SUCCESS"
        ? "Trendyol yanıtı bu ürün için başarılı görünüyor."
        : "İşlem tamamlandı.";

  return {
    ok: true,
    batchRequestId: batchRequestId ?? null,
    publishStatus,
    batch,
    message
  };
}

/**
 * Yayında ürün için Trendyol içerik güncelleme (V1 PUT veya V2 bulk update).
 */
export async function runTrendyolProductContentUpdatePipeline(input: {
  userId: string;
  storeId: string;
  membershipId: string | null;
  productId: string;
  skipActivityLog?: boolean;
}): Promise<TrendyolPublishPipelineResult> {
  if (await isStoreProductV2Enabled(input.storeId)) {
    const mappingRow = await prisma.productMarketplaceMapping.findUnique({
      where: {
        productId_platform: { productId: input.productId, platform: "trendyol" }
      }
    });
    if (mappingRow?.approvalState === "APPROVED") {
      return runTrendyolApprovedContentUpdatePipelineV2(input);
    }
    return runTrendyolProductPublishPipeline({
      ...input,
      contentRepublishMode: true,
      trendyolV2Operation: "updateUnapprovedProducts",
      skipActivityLog: input.skipActivityLog
    });
  }

  return runTrendyolProductPublishPipeline({
    ...input,
    contentRepublishMode: true,
    publishProduct: (args) =>
      updateProductOnTrendyol({
        userId: args.userId,
        storeId: args.storeId,
        sellerId: args.sellerId,
        body: args.body
      }),
    skipActivityLog: input.skipActivityLog
  });
}

async function runTrendyolApprovedContentUpdatePipelineV2(input: {
  userId: string;
  storeId: string;
  membershipId: string | null;
  productId: string;
  skipActivityLog?: boolean;
}): Promise<TrendyolPublishPipelineResult> {
  const product = await prisma.product.findFirst({
    where: { id: input.productId, userId: input.userId, storeId: input.storeId }
  });
  if (!product) {
    return { ok: false, httpStatus: 404, error: "Ürün bulunamadı." };
  }

  const mappingRow = await prisma.productMarketplaceMapping.findUnique({
    where: {
      productId_platform: { productId: input.productId, platform: "trendyol" }
    },
    include: { attributes: true }
  });
  if (!mappingRow || mappingRow.storeId !== input.storeId) {
    return { ok: false, httpStatus: 400, error: "Trendyol eşleştirmesi bulunamadı." };
  }

  const conn = await prisma.marketplaceConnection.findUnique({
    where: { storeId_platform: { storeId: input.storeId, platform: "trendyol" } }
  });
  if (!conn?.isActive) {
    return { ok: false, httpStatus: 400, error: "Aktif Trendyol bağlantısı yok." };
  }
  const sellerId = String(conn.sellerId).trim();
  if (!sellerId) {
    return { ok: false, httpStatus: 400, error: "Satıcı ID (Seller ID) tanımlı değil." };
  }

  const barcode = String(mappingRow.barcode ?? "").trim();
  if (!barcode) {
    return { ok: false, httpStatus: 400, error: "Barkod tanımlı değil." };
  }

  let contentId = mappingRow.trendyolContentId;
  if (contentId == null) {
    const baseRes = await getTrendyolProductBase({
      userId: input.userId,
      storeId: input.storeId,
      sellerId,
      barcode
    });
    if (!baseRes.ok) {
      return {
        ok: false,
        httpStatus: baseRes.status >= 400 ? baseRes.status : 502,
        error: baseRes.message || "Trendyol contentId alınamadı."
      };
    }
    contentId = parseTrendyolContentIdFromProductBase(baseRes.data);
    if (contentId != null) {
      await prisma.productMarketplaceMapping.updateMany({
        where: { id: mappingRow.id, storeId: input.storeId },
        data: { trendyolContentId: contentId }
      });
    }
  }

  if (contentId == null) {
    return {
      ok: false,
      httpStatus: 400,
      error: "Onaylı ürün contentId bulunamadı (getProductBase)."
    };
  }

  const p = product as typeof product & { imageUrls?: unknown };
  const images = buildMarketplaceImages({
    mainImageUrl: mappingRow.mainImageUrl,
    imageUrls: (mappingRow.imageUrls as unknown) ?? p.imageUrls ?? null
  });

  const title = (product.name || "Ürün").slice(0, 100);
  const descRaw = product.description?.trim() || product.name || title;
  const description =
    descRaw.length > 30000 ? descRaw.slice(0, 30000) : descRaw;

  const body = {
    items: [
      buildTrendyolApprovedContentUpdateItemV2({
        contentId,
        title,
        description,
        images,
        includeAttributes: false
      })
    ]
  };

  const correlationBatchId = randomUUID();
  await markPublishAttemptPending({
    storeId: input.storeId,
    mappingId: mappingRow.id,
    payloadHash: createPublishPayloadHash(body),
    correlationBatchId
  });

  const apiResult = await updateApprovedProductContentOnTrendyol({
    userId: input.userId,
    storeId: input.storeId,
    sellerId,
    body
  });

  let itemResult: PublishItemResult;
  if (!apiResult.ok) {
    itemResult = {
      productId: input.productId,
      mappingId: mappingRow.id,
      barcode,
      status: "FAILED",
      errorCode: mapTrendyolErrorToInternalCode(apiResult.message),
      errorMessage: apiResult.message
    };
  } else {
    itemResult = parseTrendyolPublishResponse({
      httpOk: true,
      httpStatus: apiResult.status,
      data: apiResult.data,
      context: {
        productId: input.productId,
        mappingId: mappingRow.id,
        barcode,
        stockCode: mappingRow.stockCode,
        productMainId: mappingRow.productMainId
      }
    });
  }

  await persistPublishItemResults({
    storeId: input.storeId,
    results: [itemResult],
    correlationBatchId
  });

  const batch = buildPublishBatchResult([itemResult]);
  if (itemResult.status === "FAILED") {
    return {
      ok: false,
      httpStatus: apiResult.status >= 400 ? apiResult.status : 502,
      error: itemResult.errorMessage ?? "Trendyol içerik güncellemesi başarısız.",
      batch
    };
  }

  const batchRequestId =
    itemResult.batchRequestId ??
    (apiResult.ok ? extractBatchRequestId(apiResult.data) : null);

  return {
    ok: true,
    batchRequestId: batchRequestId ?? null,
    publishStatus: batchRequestId ? "sent" : "processing",
    batch,
    message: "Onaylı ürün içerik güncellemesi Trendyol kuyruğuna alındı."
  };
}

export type TrendyolDeletePipelineResult =
  | { ok: true; batchRequestId: string | null; publishStatus: string }
  | { ok: false; error: string; httpStatus: number };

/**
 * Trendyol platformundan ürün silme talebi (DELETE + batchRequestId).
 */
export async function runTrendyolProductDeleteFromPlatform(input: {
  userId: string;
  storeId: string;
  membershipId: string | null;
  productId: string;
  skipActivityLog?: boolean;
}): Promise<TrendyolDeletePipelineResult> {
  const product = await prisma.product.findFirst({
    where: { id: input.productId, userId: input.userId, storeId: input.storeId }
  });
  if (!product) {
    return { ok: false, httpStatus: 404, error: "Ürün bulunamadı." };
  }

  const mappingRow = await prisma.productMarketplaceMapping.findUnique({
    where: {
      productId_platform: { productId: input.productId, platform: "trendyol" }
    }
  });
  if (!mappingRow) {
    return { ok: false, httpStatus: 400, error: "Trendyol eşleştirmesi bulunamadı." };
  }
  if (mappingRow.storeId !== input.storeId) {
    return { ok: false, httpStatus: 403, error: "Yetkisiz." };
  }

  const prevPublishStatus = mappingRow.publishStatus ?? "draft";
  const mapStatus = String(prevPublishStatus).toLowerCase();
  if (mapStatus === "sent" || mapStatus === "processing") {
    return {
      ok: false,
      httpStatus: 400,
      error: "Trendyol işlemi sürüyor; önce batch sonucunu kontrol edin."
    };
  }

  const barcode = String(mappingRow.barcode ?? "").trim();
  if (!barcode) {
    return { ok: false, httpStatus: 400, error: "Barkod tanımlı değil." };
  }

  const conn = await prisma.marketplaceConnection.findUnique({
    where: { storeId_platform: { storeId: input.storeId, platform: "trendyol" } }
  });
  if (!conn?.isActive) {
    return { ok: false, httpStatus: 400, error: "Aktif Trendyol bağlantısı yok." };
  }
  const sellerId = String(conn.sellerId).trim();
  if (!sellerId) {
    return { ok: false, httpStatus: 400, error: "Satıcı ID (Seller ID) tanımlı değil." };
  }

  await secureProductMarketplaceMappingUpdateMany(mappingRow.id, input.storeId, {
    publishStatus: "processing",
    lastErrorMessage: null,
    lastSyncAt: new Date()
  });

  const apiResult = (await isStoreProductV2Enabled(input.storeId))
    ? await deleteTrendyolProductsV2({
        userId: input.userId,
        storeId: input.storeId,
        sellerId,
        barcodes: [barcode]
      })
    : await deleteTrendyolProductsOnTrendyol({
        userId: input.userId,
        storeId: input.storeId,
        sellerId,
        barcodes: [barcode]
      });

  if (!apiResult.ok) {
    await secureProductMarketplaceMappingUpdateMany(mappingRow.id, input.storeId, {
      publishStatus: prevPublishStatus,
      lastErrorMessage: apiResult.message.slice(0, 2000),
      lastSyncAt: new Date()
    });
    if (!input.skipActivityLog) {
      await createActivityLog({
        userId: input.userId,
        storeId: input.storeId,
        membershipId: input.membershipId ?? undefined,
        action: "TRENDYOL_PRODUCT_DELETE_FAILED",
        entityType: "product",
        entityId: input.productId,
        message: "Trendyol ürün silme isteği başarısız"
      });
    }
    return {
      ok: false,
      httpStatus: apiResult.status >= 400 ? apiResult.status : 502,
      error: apiResult.message
    };
  }

  const batchRequestId = extractBatchRequestId(apiResult.data);

  await secureProductMarketplaceMappingUpdateMany(mappingRow.id, input.storeId, {
    publishStatus: batchRequestId ? "sent" : "processing",
    batchRequestId: batchRequestId ?? mappingRow.batchRequestId,
    lastErrorMessage: batchRequestId
      ? null
      : "Yanıtta batchRequestId yok; Trendyol panelinden doğrulayın.",
    lastSyncAt: new Date()
  });

  if (batchRequestId) {
    try {
      await prisma.trendyolPublishJob.upsert({
        where: {
          storeId_batchRequestId: { storeId: input.storeId, batchRequestId }
        },
        create: {
          userId: input.userId,
          storeId: input.storeId,
          batchRequestId,
          platform: "trendyol",
          batchStatus: "IN_PROGRESS",
          itemCount: 1,
          successCount: 0,
          failedCount: 0,
          pendingCount: 1,
          batchRequestType: "ProductDelete",
          lastSyncMessage: "Ürün silme Trendyol kuyruğunda."
        },
        update: {
          batchStatus: "IN_PROGRESS",
          batchRequestType: "ProductDelete",
          lastSyncMessage: "Ürün silme Trendyol kuyruğunda."
        }
      });
    } catch (e) {
      console.warn("trendyolPublishJob upsert (delete) skipped:", e);
    }
  }

  if (!input.skipActivityLog) {
    await createActivityLog({
      userId: input.userId,
      storeId: input.storeId,
      membershipId: input.membershipId ?? undefined,
      action: "TRENDYOL_PRODUCT_DELETE_QUEUED",
      entityType: "product",
      entityId: input.productId,
      message: "Trendyol ürün silme kuyruğa alındı."
    });
  }

  return {
    ok: true,
    batchRequestId: batchRequestId ?? null,
    publishStatus: batchRequestId ? "sent" : "processing"
  };
}
