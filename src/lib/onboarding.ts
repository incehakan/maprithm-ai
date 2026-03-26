import { prisma } from "./prisma";

export type OnboardingStep = {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  actionLabel: string;
  actionHref: string;
};

export type OnboardingStatus = {
  steps: OnboardingStep[];
  completedCount: number;
  totalCount: number;
  progressPercent: number;
  isComplete: boolean;
};

export async function getOnboardingStatus(params: {
  userId: string;
  storeId: string;
}): Promise<OnboardingStatus> {
  const anyPrisma = prisma as any;

  // Paralel sorgular
  const [
    productCount,
    settingsExists,
    activityLogs
  ] = await Promise.all([
    prisma.product.count({ where: { userId: params.userId, storeId: params.storeId } }),
    checkSettingsExists(params.userId, params.storeId),
    getActivityLogActions(params.userId, params.storeId)
  ]);

  const activityActions = new Set(activityLogs.map((log) => log.action.toLowerCase()));

  const steps: OnboardingStep[] = [
    {
      id: "settings",
      title: "Ayarları Tamamla",
      description: "Varsayılan ticari ayarlarınızı belirleyin",
      completed: settingsExists,
      actionLabel: "Ayarlara Git",
      actionHref: "/settings"
    },
    {
      id: "first_product",
      title: "İlk Ürünü Ekle",
      description: "Manuel veya CSV ile ürün ekleyin",
      completed: productCount > 0,
      actionLabel: productCount > 0 ? "Ürünleri Gör" : "Ürün Ekle",
      actionHref: productCount > 0 ? "/products" : "/products/new"
    },
    {
      id: "csv_import",
      title: "CSV İçe Aktarma",
      description: "Toplu ürün yüklemesi yapın",
      completed: activityActions.has("csv_import"),
      actionLabel: "CSV İçe Aktar",
      actionHref: "/products/import"
    },
    {
      id: "ai_product",
      title: "AI ile Ürün Oluştur",
      description: "Yapay zeka ile ürün içeriği üretin",
      completed: activityActions.has("product_create") || activityActions.has("ai_optimize_single") || activityActions.has("bulk_ai_optimize"),
      actionLabel: "AI Ürün Oluştur",
      actionHref: "/ai-product"
    },
    {
      id: "health_check",
      title: "Sağlık Kontrolü Yap",
      description: "Ürünlerinizdeki eksikleri kontrol edin",
      completed: activityActions.has("products_health_viewed"),
      actionLabel: "Sağlık Ekranı",
      actionHref: "/products/health"
    },
    {
      id: "trendyol_export",
      title: "Trendyol Export Al",
      description: "Ürünlerinizi pazaryerine aktarın",
      completed: activityActions.has("trendyol_export"),
      actionLabel: "Export Al",
      actionHref: "/products"
    }
  ];

  const completedCount = steps.filter((s) => s.completed).length;
  const totalCount = steps.length;
  const progressPercent = Math.round((completedCount / totalCount) * 100);

  return {
    steps,
    completedCount,
    totalCount,
    progressPercent,
    isComplete: completedCount === totalCount
  };
}

async function checkSettingsExists(userId: string, storeId: string): Promise<boolean> {
  try {
    const anyPrisma = prisma as any;

    if (!anyPrisma.userSettings || typeof anyPrisma.userSettings.findUnique !== "function") {
      return false;
    }

    const settings = await anyPrisma.userSettings.findUnique({
      where: { storeId },
      select: { id: true }
    });

    return !!settings;
  } catch {
    return false;
  }
}

async function getActivityLogActions(userId: string, storeId: string): Promise<{ action: string }[]> {
  try {
    const anyPrisma = prisma as any;

    if (!anyPrisma.activityLog || typeof anyPrisma.activityLog.findMany !== "function") {
      return [];
    }

    const logs = await anyPrisma.activityLog.findMany({
      where: { userId, storeId },
      select: { action: true },
      distinct: ["action"]
    });

    return logs;
  } catch {
    return [];
  }
}
