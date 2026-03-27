import type { Prisma } from "@prisma/client";

/**
 * Varsayılan liste / dropdown: isActive === false olanlar hariç (null ve true gösterilir).
 */
export const trendyolBrandListableWhere: Prisma.TrendyolBrandWhereInput = {
  AND: [{ removedAt: null }, { OR: [{ isActive: null }, { isActive: true }] }]
};

export const trendyolCategoryListableWhere: Prisma.TrendyolCategoryWhereInput = {
  AND: [{ removedAt: null }, { OR: [{ isActive: null }, { isActive: true }] }]
};
