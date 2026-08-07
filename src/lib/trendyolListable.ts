import type { Prisma } from "@prisma/client";

/**
 * Varsayılan liste / dropdown: isActive === false olanlar hariç (null ve true gösterilir).
 */
export const trendyolBrandListableWhere: any = {
  platform: "TRENDYOL",
  isActive: true
};

export const trendyolCategoryListableWhere: any = {
  platform: "TRENDYOL",
  isActive: true
};
