export type DisplayProductStatus = "active" | "out_of_stock" | "archived";

type ProductLike = {
  stock: number;
  lifecycleStatus?: string | null;
};

type MappingLike = {
  publishStatus?: string | null;
};

export function isArchived(
  product: ProductLike,
  mapping?: MappingLike | null
): boolean {
  const lifecycle = (product.lifecycleStatus ?? "").toLowerCase();
  const publishStatus = (mapping?.publishStatus ?? "").toLowerCase();
  return lifecycle === "archived" || publishStatus === "archived";
}

export function isOutOfStock(
  product: ProductLike,
  mapping?: MappingLike | null
): boolean {
  if (isArchived(product, mapping)) return false;
  const lifecycle = (product.lifecycleStatus ?? "").toLowerCase();
  const publishStatus = (mapping?.publishStatus ?? "").toLowerCase();
  return (
    product.stock === 0 &&
    (lifecycle === "published" || lifecycle === "ready") &&
    publishStatus === "published"
  );
}

export function getProductDisplayStatus(
  product: ProductLike,
  mapping?: MappingLike | null
): DisplayProductStatus {
  if (isArchived(product, mapping)) return "archived";
  if (isOutOfStock(product, mapping)) return "out_of_stock";
  return "active";
}
