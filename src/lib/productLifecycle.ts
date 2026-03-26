export type ProductLifecycleStatus =
  | "draft"
  | "ready"
  | "published"
  | "unpublished"
  | "archived";

export type MarketplacePublishStatus =
  | "draft"
  | "ready"
  | "sent"
  | "processing"
  | "published"
  | "failed"
  | "unpublished"
  | "archived";

type ProductLike = {
  lifecycleStatus?: string | null;
  stock?: number | null;
};

type MappingLike = {
  publishStatus?: string | null;
};

const VALID_LIFECYCLE: ProductLifecycleStatus[] = [
  "draft",
  "ready",
  "published",
  "unpublished",
  "archived"
];

export function getProductLifecycleStatus(
  product: ProductLike,
  mapping?: MappingLike | null
): ProductLifecycleStatus {
  const lifecycle = (product.lifecycleStatus ?? "").toLowerCase();
  if (VALID_LIFECYCLE.includes(lifecycle as ProductLifecycleStatus)) {
    return lifecycle as ProductLifecycleStatus;
  }

  const publishStatus = (mapping?.publishStatus ?? "").toLowerCase();
  if (publishStatus === "published") return "published";
  if (publishStatus === "unpublished") return "unpublished";
  if (publishStatus === "archived") return "archived";
  if (publishStatus === "ready") return "ready";
  return "draft";
}

export function canPublishProduct(
  product: ProductLike,
  mapping?: MappingLike | null
): boolean {
  const status = getProductLifecycleStatus(product, mapping);
  if (status === "archived") return false;
  if ((product.stock ?? 0) <= 0) return false;
  return status === "ready" || status === "draft" || status === "unpublished";
}

export function canUnpublishProduct(
  product: ProductLike,
  mapping?: MappingLike | null
): boolean {
  const status = getProductLifecycleStatus(product, mapping);
  const publishStatus = (mapping?.publishStatus ?? "").toLowerCase();
  return status === "published" || publishStatus === "published";
}

export function canArchiveProduct(
  product: ProductLike,
  mapping?: MappingLike | null
): boolean {
  const status = getProductLifecycleStatus(product, mapping);
  if (status === "published") return false;
  return status === "draft" || status === "ready" || status === "unpublished";
}
