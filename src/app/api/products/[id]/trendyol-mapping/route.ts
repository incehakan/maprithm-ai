import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createActivityLog } from "@/lib/activityLog";
import { getUserSettings } from "@/lib/userSettings";
import { trendyolCategoryListableWhere } from "@/lib/trendyolListable";
import {
  evaluateTrendyolPublishReadiness,
  type CategoryAttrDef
} from "@/lib/trendyolMappingReadiness";
import { normalizeImageUrls } from "@/lib/productImages";
import { resolveTrendyolCommercials } from "@/lib/trendyolCreateProductPayload";
import { requireActiveStore } from "@/lib/requireActiveStore";
import { getCargoCompaniesForStore } from "@/lib/trendyol/getCargoCompaniesForStore";
import { Prisma } from "@prisma/client";
import { isFeatureEnabled, FEATURE_FLAGS } from "@/lib/featureFlags";
import { categoryRequiresOrigin } from "@/lib/trendyolOriginRequired";
import { readCategoryAttrIsSlicer } from "@/lib/trendyolMappingReadiness";

type Params = { params: { id: string } };

function serializeMapping(m: Record<string, unknown>) {
  return {
    id: m.id as string,
    trendyolBrandId: m.trendyolBrandId as number | null,
    trendyolCategoryId: m.trendyolCategoryId as number | null,
    barcode: (m.barcode as string) ?? null,
    stockCode: (m.stockCode as string) ?? null,
    productMainId: (m.productMainId as string) ?? null,
    cargoCompanyId: (m.cargoCompanyId as number) ?? null,
    dimensionalWeight: (m.dimensionalWeight as number) ?? null,
    currencyType: (m.currencyType as string) ?? "TRY",
    vatRate: (m.vatRate as number) ?? null,
    listPrice: (m.listPrice as number) ?? null,
    salePrice: (m.salePrice as number) ?? null,
    quantity: (m.quantity as number) ?? null,
    useProductPrice: (m.useProductPrice as boolean) ?? true,
    useProductStock: (m.useProductStock as boolean) ?? true,
    publishStatus: (m.publishStatus as string) ?? "draft",
    approvalState: (m.approvalState as string) ?? "UNAPPROVED",
    trendyolContentId: (m.trendyolContentId as number) ?? null,
    publishedAt: (m.publishedAt as Date | null)?.toISOString?.() ?? null,
    unpublishedAt: (m.unpublishedAt as Date | null)?.toISOString?.() ?? null,
    archivedAt: (m.archivedAt as Date | null)?.toISOString?.() ?? null,
    lastSyncAt: (m.lastSyncAt as Date | null)?.toISOString?.() ?? null,
    batchRequestId: (m.batchRequestId as string) ?? null,
    lastErrorMessage: (m.lastErrorMessage as string) ?? null,
    lastPublishStatus: (m.lastPublishStatus as string) ?? null,
    lastPublishErrorCode: (m.lastPublishErrorCode as string) ?? null,
    lastPublishErrorMessage: (m.lastPublishErrorMessage as string) ?? null,
    lastPublishAttemptAt:
      (m.lastPublishAttemptAt as Date | null)?.toISOString?.() ?? null,
    lastSuccessfulPublishAt:
      (m.lastSuccessfulPublishAt as Date | null)?.toISOString?.() ?? null,
    lastPublishBatchId: (m.lastPublishBatchId as string) ?? null,
    lastPublishPayloadHash: (m.lastPublishPayloadHash as string) ?? null,
    mainImageUrl: (m.mainImageUrl as string) ?? null,
    imageUrls: (m.imageUrls as unknown) ?? null
  };
}

export async function GET(request: Request, { params }: Params) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: any) {
    const msg = e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  const product = await prisma.product.findFirst({
    where: { id: params.id, userId: ctx.userId, storeId: ctx.storeId }
  });

  if (!product) {
    return NextResponse.json({ error: "Ürün bulunamadı." }, { status: 404 });
  }

  const store = await prisma.store.findUnique({
    where: { id: ctx.storeId },
    select: { featureFlags: true }
  });
  const originFieldEnabled = store
    ? isFeatureEnabled(store, FEATURE_FLAGS.ORIGIN_FIELD)
    : false;

  const settings = await getUserSettings({ userId: ctx.userId, storeId: ctx.storeId });
  const p = product as any;
  const storeConnection = await prisma.marketplaceConnection.findUnique({
    where: { storeId_platform: { storeId: ctx.storeId, platform: "trendyol" } },
    select: { defaultCargoCompanyId: true }
  });

  const cargoCompanyStats = await prisma.productMarketplaceMapping.groupBy({
    by: ["cargoCompanyId"],
    where: {
      storeId: ctx.storeId,
      platform: "trendyol",
      cargoCompanyId: { not: null }
    },
    _count: { cargoCompanyId: true },
    orderBy: {
      _count: {
        cargoCompanyId: "desc"
      }
    }
  });
  const cargoCompanyFromMappings = cargoCompanyStats
    .map((r) => r.cargoCompanyId)
    .filter((v): v is number => v != null);

  const defaultCargoFromConnection =
    storeConnection?.defaultCargoCompanyId != null
      ? Number(storeConnection.defaultCargoCompanyId)
      : null;

  const cargoSelectBase = await getCargoCompaniesForStore({
    userId: ctx.userId,
    storeId: ctx.storeId,
    extraCargoCompanyIds: cargoCompanyFromMappings
  });
  const cargoCompanyOptions = cargoSelectBase.options;

  const defaults = {
    trendyolBrandId: null as number | null,
    trendyolCategoryId: null as number | null,
    barcode: "" as string,
    stockCode: product.sku?.trim() ?? "",
    productMainId: "" as string,
    cargoCompanyId:
      defaultCargoFromConnection ?? cargoCompanyOptions[0]?.id ?? null,
    dimensionalWeight: settings.defaultDesi ?? 1,
    currencyType: settings.defaultCurrency || "TRY",
    vatRate: p.vatRate ?? settings.defaultVatRate ?? 20,
    listPrice: null as number | null,
    salePrice: null as number | null,
    quantity: null as number | null,
    useProductPrice: true,
    useProductStock: true,
    publishStatus: "draft",
    mainImageUrl: ((product as any).mainImageUrl as string) ?? "",
    imageUrls: ((product as any).imageUrls as unknown) ?? null
  };

  const mappingRow = await prisma.productMarketplaceMapping.findFirst({
    where: {
      productId: params.id,
      platform: "trendyol",
      storeId: ctx.storeId
    },
    include: {
      attributes: true
    }
  });

  const mapping = mappingRow
    ? {
        ...serializeMapping(mappingRow as Record<string, unknown>),
        attributes: mappingRow.attributes.map((a) => ({
          attributeId: a.attributeId,
          attributeName: a.attributeName,
          attributeValueId: a.attributeValueId,
          customValue: a.customValue
        }))
      }
    : null;

  const mappingBrandId = mapping?.trendyolBrandId ?? null;
  const selectedBrandRow =
    mappingBrandId != null
      ? await prisma.trendyolBrand.findFirst({
          where: { brandId: mappingBrandId as number }
        })
      : null;
  const trendyolBrandName = selectedBrandRow?.name ?? null;
  const brands =
    selectedBrandRow != null
      ? [{ brandId: selectedBrandRow.brandId, name: selectedBrandRow.name }]
      : [];

  const categories = await prisma.trendyolCategory.findMany({
    where: {
      ...trendyolCategoryListableWhere,
      isLeaf: true
    },
    select: { categoryId: true, name: true, isLeaf: true },
    orderBy: { name: "asc" },
    take: 8000
  });

  const { searchParams } = new URL(request.url);
  const previewRaw = searchParams.get("previewCategoryId");
  const previewCategoryId =
    previewRaw != null && previewRaw !== ""
      ? parseInt(previewRaw, 10)
      : NaN;

  const effectiveCategoryId = Number.isFinite(previewCategoryId) &&
    previewCategoryId > 0
    ? previewCategoryId
    : mapping?.trendyolCategoryId ?? null;

  let categoryAttributes: Array<{
    id: string;
    categoryId: number;
    attributeId: number;
    attributeName: string;
    isRequired: boolean;
    isVariantable: boolean;
    allowCustom: boolean;
    isSlicer: boolean;
    values: Array<{
      attributeValueId: number;
      attributeValue: string;
    }>;
  }> = [];

  if (effectiveCategoryId != null) {
    const attrs = await prisma.trendyolCategoryAttribute.findMany({
      where: { categoryId: effectiveCategoryId },
      select: {
        id: true,
        categoryId: true,
        attributeId: true,
        attributeName: true,
        isRequired: true,
        isVariantable: true,
        allowCustom: true,
        rawData: true,
        values: {
          orderBy: { attributeValue: "asc" }
        }
      },
      orderBy: { attributeName: "asc" }
    });

    categoryAttributes = attrs.map((attr) => ({
      id: attr.id,
      categoryId: attr.categoryId,
      attributeId: attr.attributeId,
      attributeName: attr.attributeName,
      isRequired: attr.isRequired,
      isVariantable: attr.isVariantable,
      allowCustom: attr.allowCustom,
      isSlicer: readCategoryAttrIsSlicer(attr.rawData),
      values: attr.values.map((v) => ({
        attributeValueId: v.attributeValueId,
        attributeValue: v.attributeValue
      }))
    }));
  }

  const defs: CategoryAttrDef[] = categoryAttributes.map((a) => ({
    attributeId: a.attributeId,
    attributeName: a.attributeName,
    isRequired: a.isRequired
  }));

  const savedAttrs =
    mapping?.attributes?.map((a) => ({
      attributeId: a.attributeId,
      attributeValueId: a.attributeValueId,
      customValue: a.customValue
    })) ?? [];

  const categoryIdForReadiness =
    effectiveCategoryId ??
    mapping?.trendyolCategoryId ??
    defaults.trendyolCategoryId;

  const effectiveCommercials = resolveTrendyolCommercials({
    product: {
      id: product.id,
      name: product.name,
      description: product.description,
      stock: product.stock,
      price: Number(product.price)
    },
    mapping: {
      barcode: mapping?.barcode ?? defaults.barcode,
      stockCode: mapping?.stockCode ?? defaults.stockCode,
      productMainId: mapping?.productMainId ?? defaults.productMainId,
      trendyolBrandId: mapping?.trendyolBrandId ?? defaults.trendyolBrandId,
      trendyolCategoryId: categoryIdForReadiness,
      quantity: mapping?.quantity ?? defaults.quantity,
      dimensionalWeight: mapping?.dimensionalWeight ?? defaults.dimensionalWeight,
      currencyType: mapping?.currencyType ?? defaults.currencyType,
      listPrice: mapping?.listPrice ?? defaults.listPrice,
      salePrice: mapping?.salePrice ?? defaults.salePrice,
      vatRate: mapping?.vatRate ?? defaults.vatRate,
      cargoCompanyId: mapping?.cargoCompanyId ?? defaults.cargoCompanyId,
      useProductPrice: (mapping as any)?.useProductPrice ?? defaults.useProductPrice,
      useProductStock: (mapping as any)?.useProductStock ?? defaults.useProductStock,
      mainImageUrl: mapping?.mainImageUrl ?? defaults.mainImageUrl,
      imageUrls: mapping?.imageUrls ?? defaults.imageUrls
    },
    mappingAttributes: [],
    fallbackVatRate: defaults.vatRate ?? 20,
    shipmentAddressId: "1",
    returnAddressId: "1"
  });

  const readiness = evaluateTrendyolPublishReadiness(
    {
      trendyolBrandId: mapping?.trendyolBrandId ?? defaults.trendyolBrandId,
      trendyolCategoryId: categoryIdForReadiness,
      barcode: mapping?.barcode ?? defaults.barcode,
      stockCode: mapping?.stockCode ?? defaults.stockCode,
      productMainId: mapping?.productMainId ?? defaults.productMainId,
      salePrice: effectiveCommercials.salePrice,
      quantity: effectiveCommercials.quantity,
      mainImageUrl: mapping?.mainImageUrl ?? defaults.mainImageUrl,
      imageUrls: mapping?.imageUrls ?? defaults.imageUrls,
      cargoCompanyId: mapping?.cargoCompanyId ?? defaults.cargoCompanyId,
      listPrice: effectiveCommercials.listPrice
    },
    defs,
    savedAttrs,
    { price: Number(product.price), stock: product.stock }
  );

  const originCountries = originFieldEnabled
    ? await prisma.trendyolOriginCountry.findMany({
        orderBy: { name: "asc" },
        select: { code: true, name: true }
      })
    : [];

  return NextResponse.json({
    mapping,
    defaults,
    cargoCompanyOptions,
    brands,
    trendyolBrandName,
    categories,
    categoryAttributes,
    effectiveCategoryId,
    readiness,
    productOrigin: product.origin ?? null,
    originFieldEnabled,
    categoryRequiresOrigin: categoryRequiresOrigin(defs),
    originCountries,
    effectiveCommercials: {
      ...effectiveCommercials,
      barcode: mapping?.barcode ?? defaults.barcode ?? null,
      productPrice: Number(product.price),
      overrideSalePrice: mapping?.salePrice ?? null
    }
  });
}

type PostBody = {
  trendyolBrandId?: number | null;
  trendyolCategoryId?: number | null;
  barcode?: string | null;
  stockCode?: string | null;
  productMainId?: string | null;
  cargoCompanyId?: number | null;
  dimensionalWeight?: number | null;
  currencyType?: string | null;
  vatRate?: number | null;
  listPrice?: number | null;
  salePrice?: number | null;
  quantity?: number | null;
  useProductPrice?: boolean | null;
  useProductStock?: boolean | null;
  publishStatus?: string | null;
  batchRequestId?: string | null;
  lastErrorMessage?: string | null;
  mainImageUrl?: string | null;
  imageUrls?: unknown;
  origin?: string | null;
  attributes?: Array<{
    attributeId: number;
    attributeName: string;
    attributeValueId?: number | null;
    customValue?: string | null;
  }>;
};

export async function POST(request: Request, { params }: Params) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: any) {
    const msg = e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  const product = await prisma.product.findFirst({
    where: { id: params.id, userId: ctx.userId, storeId: ctx.storeId }
  });

  if (!product) {
    return NextResponse.json({ error: "Ürün bulunamadı." }, { status: 404 });
  }

  let body: PostBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON." }, { status: 400 });
  }

  const attrsIn = Array.isArray(body.attributes) ? body.attributes : [];

  const normalizedImageUrls = normalizeImageUrls([
    body.mainImageUrl ?? null,
    body.imageUrls ?? null
  ]);
  const normalizedMainImageUrl = normalizedImageUrls[0] ?? null;

  const data = {
    userId: ctx.userId,
    storeId: ctx.storeId,
    platform: "trendyol",
    trendyolBrandId:
      body.trendyolBrandId === undefined || body.trendyolBrandId === null
        ? null
        : Number(body.trendyolBrandId),
    trendyolCategoryId:
      body.trendyolCategoryId === undefined || body.trendyolCategoryId === null
        ? null
        : Number(body.trendyolCategoryId),
    barcode: body.barcode?.trim() || null,
    stockCode: body.stockCode?.trim() || null,
    productMainId: body.productMainId?.trim() || null,
    cargoCompanyId:
      body.cargoCompanyId != null && Number.isFinite(Number(body.cargoCompanyId))
        ? Number(body.cargoCompanyId)
        : null,
    dimensionalWeight:
      body.dimensionalWeight != null &&
      Number.isFinite(Number(body.dimensionalWeight))
        ? Number(body.dimensionalWeight)
        : null,
    currencyType: (body.currencyType?.trim() || "TRY").slice(0, 8),
    vatRate:
      body.vatRate != null && Number.isFinite(Number(body.vatRate))
        ? Number(body.vatRate)
        : null,
    useProductPrice:
      body.useProductPrice === false ? false : true,
    useProductStock:
      body.useProductStock === false ? false : true,
    listPrice:
      body.useProductPrice === false &&
      body.listPrice != null &&
      Number.isFinite(Number(body.listPrice))
        ? Number(body.listPrice)
        : null,
    salePrice:
      body.useProductPrice === false &&
      body.salePrice != null &&
      Number.isFinite(Number(body.salePrice))
        ? Number(body.salePrice)
        : null,
    quantity:
      body.useProductStock === false &&
      body.quantity != null &&
      Number.isFinite(Number(body.quantity))
        ? Math.round(Number(body.quantity))
        : null,
    publishStatus: (body.publishStatus?.trim().toLowerCase() || "draft").slice(0, 32),
    batchRequestId: body.batchRequestId?.trim() || null,
    lastErrorMessage: body.lastErrorMessage?.trim() || null,
    mainImageUrl: normalizedMainImageUrl,
    imageUrls:
      normalizedImageUrls.length > 0
        ? (normalizedImageUrls as Prisma.InputJsonValue)
        : Prisma.JsonNull
  };

  try {
    const mapping = await prisma.$transaction(async (tx) => {
      const m = await tx.productMarketplaceMapping.upsert({
        where: {
          productId_platform: {
            productId: params.id,
            platform: "trendyol"
          }
        },
        create: {
          productId: params.id,
          ...data
        },
        update: data
      });

      await tx.productMarketplaceAttribute.deleteMany({
        where: { mappingId: m.id }
      });

      for (const a of attrsIn) {
        const aid = Number(a.attributeId);
        if (!Number.isFinite(aid) || aid <= 0) continue;
        const name = String(a.attributeName ?? "").trim() || `Attr ${aid}`;
        const vid =
          a.attributeValueId != null && Number.isFinite(Number(a.attributeValueId))
            ? Number(a.attributeValueId)
            : null;
        const custom =
          a.customValue != null && String(a.customValue).trim() !== ""
            ? String(a.customValue).trim()
            : null;

        await tx.productMarketplaceAttribute.create({
          data: {
            mappingId: m.id,
            storeId: ctx.storeId,
            attributeId: aid,
            attributeName: name,
            attributeValueId: vid,
            customValue: custom
          }
        });
      }

      return m;
    });

    await prisma.product.updateMany({
      where: { id: params.id, userId: ctx.userId, storeId: ctx.storeId },
      data: {
        mainImageUrl: normalizedMainImageUrl,
        imageUrls:
          normalizedImageUrls.length > 0
            ? (normalizedImageUrls as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        ...(body.origin !== undefined
          ? {
              origin:
                body.origin != null && String(body.origin).trim() !== ""
                  ? String(body.origin).trim().slice(0, 2).toUpperCase()
                  : null
            }
          : {})
      }
    });

    await createActivityLog({
      userId: ctx.userId,
      storeId: ctx.storeId,
      membershipId: ctx.membershipId,
      action: "TRENDYOL_PRODUCT_MAPPING_SAVED",
      entityType: "product",
      entityId: params.id,
      message: "Trendyol ürün eşleştirmesi kaydedildi"
    });

    if (["ready", "draft", "archived", "unpublished"].includes(data.publishStatus)) {
      await prisma.product.updateMany({
        where: { id: params.id, userId: ctx.userId, storeId: ctx.storeId },
        data: {
          lifecycleStatus: data.publishStatus === "ready" ? "ready" : data.publishStatus
        }
      });
    }

    const full = await prisma.productMarketplaceMapping.findFirst({
      where: { id: mapping.id, storeId: ctx.storeId },
      include: { attributes: true }
    });
    if (!full) {
      return NextResponse.json({ error: "Ürün bulunamadı." }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      mapping: {
        ...serializeMapping(full as Record<string, unknown>),
        attributes: full.attributes.map((a) => ({
          attributeId: a.attributeId,
          attributeName: a.attributeName,
          attributeValueId: a.attributeValueId,
          customValue: a.customValue
        }))
      }
    });
  } catch (e) {
    console.error("trendyol-mapping POST error:", e);
    return NextResponse.json(
      { error: "Kayıt sırasında hata oluştu." },
      { status: 500 }
    );
  }
}
