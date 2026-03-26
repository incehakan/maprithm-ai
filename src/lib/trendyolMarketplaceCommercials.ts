type ProductCommercialLike = {
  price: number;
  stock: number;
};

type MappingCommercialLike = {
  useProductPrice?: boolean | null;
  useProductStock?: boolean | null;
  salePrice?: number | null;
  listPrice?: number | null;
  quantity?: number | null;
  barcode?: string | null;
};

export function resolveMarketplaceSalePrice(
  product: ProductCommercialLike,
  mapping: MappingCommercialLike
): number | null {
  if (mapping.useProductPrice !== false) {
    return Number(product.price);
  }
  if (mapping.salePrice != null && Number.isFinite(mapping.salePrice)) {
    return mapping.salePrice;
  }
  return null;
}

export function resolveMarketplaceListPrice(
  product: ProductCommercialLike,
  mapping: MappingCommercialLike
): number | null {
  const salePrice = resolveMarketplaceSalePrice(product, mapping);
  if (salePrice == null) return null;
  if (
    mapping.listPrice != null &&
    Number.isFinite(mapping.listPrice) &&
    mapping.listPrice >= salePrice
  ) {
    return mapping.listPrice;
  }
  return salePrice;
}

export function resolveMarketplaceQuantity(
  product: ProductCommercialLike,
  mapping: MappingCommercialLike
): number | null {
  if (mapping.useProductStock !== false) {
    return Math.round(product.stock);
  }
  if (mapping.quantity != null && Number.isFinite(mapping.quantity)) {
    return Math.round(mapping.quantity);
  }
  return null;
}

export function buildPriceStockUpdatePayload(input: {
  product: ProductCommercialLike;
  mapping: MappingCommercialLike;
}): {
  items: Array<{
    barcode: string;
    quantity: number;
    salePrice: number;
    listPrice: number;
  }>;
} | null {
  const barcode = input.mapping.barcode?.trim() ?? "";
  const salePrice = resolveMarketplaceSalePrice(input.product, input.mapping);
  const listPrice = resolveMarketplaceListPrice(input.product, input.mapping);
  const quantity = resolveMarketplaceQuantity(input.product, input.mapping);

  if (!barcode || salePrice == null || listPrice == null || quantity == null) {
    return null;
  }

  return {
    items: [
      {
        barcode,
        quantity,
        salePrice,
        listPrice
      }
    ]
  };
}
