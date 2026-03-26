import { prisma } from "@/lib/prisma";
import { createActivityLog } from "@/lib/activityLog";
import { getUserSettings } from "@/lib/userSettings";
import {
  buildTrendyolCreateProductBody,
  extractBatchRequestId,
  resolveTrendyolCommercials
} from "@/lib/trendyolCreateProductPayload";
import { evaluateTrendyolPublishReadiness } from "@/lib/trendyolMappingReadiness";
import { canPublishProduct } from "@/lib/productLifecycle";
import { publishProductToTrendyol } from "@/lib/trendyolPublishProduct";
import type { ProductMarketplaceMapping } from "@prisma/client";

export type TrendyolPublishPipelineResult =
  | { ok: true; batchRequestId: string | null; publishStatus: string }
  | {
      ok: false;
      error: string;
      httpStatus: number;
      missing?: string[];
    };

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
): TrendyolPublishPipelineResult | null {
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
  publishProduct?: PublishProductFn;
  skipActivityLog?: boolean;
}): Promise<TrendyolPublishPipelineResult> {
  const publishFn = input.publishProduct ?? publishProductToTrendyol;
  const contentRepublishMode = input.contentRepublishMode === true;

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
  if (gate) return gate;

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

  const shipmentAddressId = conn.shipmentAddressId?.trim();
  const returnAddressId = conn.returnAddressId?.trim();
  if (!shipmentAddressId || !returnAddressId) {
    return {
      ok: false,
      httpStatus: 400,
      error: "Trendyol adresi seçilmeden ürün gönderilemez.",
      missing: [
        ...(shipmentAddressId ? [] : ["Gönderim (sevkiyat) adresi"]),
        ...(returnAddressId ? [] : ["İade adresi"])
      ]
    };
  }

  const categoryId = mappingRow.trendyolCategoryId as number | null;
  if (categoryId == null) {
    return {
      ok: false,
      httpStatus: 400,
      error: "Trendyol kategori seçilmemiş.",
      missing: ["Trendyol kategori"]
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
  const p = product as typeof product & { imageUrls?: unknown; vatRate?: number | null };
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
    return {
      ok: false,
      httpStatus: 400,
      error: "Yayına hazırlık kontrolü başarısız.",
      missing: publishCheck.missing
    };
  }

  const fallbackVat =
    mappingRow.vatRate != null && Number.isFinite(mappingRow.vatRate)
      ? mappingRow.vatRate
      : p.vatRate != null && Number.isFinite(p.vatRate)
        ? p.vatRate
        : settings.defaultVatRate ?? 20;

  let body: ReturnType<typeof buildTrendyolCreateProductBody>;
  try {
    body = buildTrendyolCreateProductBody({
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
      returnAddressId
    });
  } catch (e) {
    console.error("buildTrendyolCreateProductBody error:", e);
    return {
      ok: false,
      httpStatus: 400,
      error: e instanceof Error ? e.message : "Payload oluşturulamadı."
    };
  }

  await prisma.productMarketplaceMapping.update({
    where: { id: mappingRow.id },
    data: {
      publishStatus: "processing",
      lastErrorMessage: null,
      lastSyncAt: new Date()
    }
  });

  const apiResult = await publishFn({
    userId: input.userId,
    storeId: input.storeId,
    sellerId,
    body
  });

  if (!apiResult.ok) {
    const duplicateBarcode =
      /ayn[iı]\s+barkod/i.test(apiResult.message) ||
      /already exists/i.test(apiResult.message);
    const friendlyError = duplicateBarcode
      ? "Barkod çakışması veya mevcut kayıt."
      : apiResult.message;

    await prisma.productMarketplaceMapping.update({
      where: { id: mappingRow.id },
      data: {
        publishStatus: "failed",
        lastErrorMessage: friendlyError.slice(0, 2000),
        lastSyncAt: new Date()
      }
    });

    if (!input.skipActivityLog) {
      await createActivityLog({
        userId: input.userId,
        storeId: input.storeId,
        membershipId: input.membershipId ?? undefined,
        action: "TRENDYOL_PRODUCT_PUBLISH_FAILED",
        entityType: "product",
        entityId: input.productId,
        message: "Trendyol ürün gönderimi başarısız oldu"
      });
    }

    return {
      ok: false,
      httpStatus: apiResult.status >= 400 ? apiResult.status : 502,
      error: friendlyError
    };
  }

  const batchRequestId = extractBatchRequestId(apiResult.data);

  const successData: Record<string, unknown> = {
    publishStatus: batchRequestId ? "sent" : "processing",
    lastErrorMessage: batchRequestId
      ? null
      : "Yanıtta batchRequestId bulunamadı; Trendyol panelinden kontrol edin.",
    lastSyncAt: new Date()
  };
  if (batchRequestId) {
    successData.batchRequestId = batchRequestId;
  }

  await prisma.productMarketplaceMapping.update({
    where: { id: mappingRow.id },
    data: successData
  });

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
          batchRequestType: "ProductPublish",
          lastSyncMessage: "Ürün Trendyol kuyruğuna alındı."
        },
        update: {
          batchStatus: "IN_PROGRESS",
          itemCount: 1,
          pendingCount: 1,
          batchRequestType: "ProductPublish",
          lastSyncMessage: "Ürün Trendyol kuyruğuna alındı."
        }
      });
    } catch (e) {
      console.warn("trendyolPublishJob upsert skipped:", e);
    }
  }

  if (!input.skipActivityLog) {
    await createActivityLog({
      userId: input.userId,
      storeId: input.storeId,
      membershipId: input.membershipId ?? undefined,
      action: "PRODUCT_PUBLISHED",
      entityType: "product",
      entityId: input.productId,
      message: "Ürün Trendyol'da yayınlanmak üzere gönderildi."
    });
  }

  return {
    ok: true,
    batchRequestId: batchRequestId ?? null,
    publishStatus: batchRequestId ? "sent" : "processing"
  };
}
