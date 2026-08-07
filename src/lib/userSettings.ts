import { prisma } from "./prisma";

export type UserSettingsData = {
  companyName: string;
  defaultCurrency: string;
  defaultVatRate: number;
  defaultCommissionRate: number | null;
  defaultCargoCost: number | null;
  defaultTargetProfitRate: number | null;
  defaultDesi: number;
  fallbackBrand: string;
  fallbackCategory: string;
  xmlBarcodePrefix: string;
};

export const DEFAULT_SETTINGS: UserSettingsData = {
  companyName: "",
  defaultCurrency: "TRY",
  defaultVatRate: 20,
  defaultCommissionRate: null,
  defaultCargoCost: null,
  defaultTargetProfitRate: null,
  defaultDesi: 1,
  fallbackBrand: "",
  fallbackCategory: "",
  xmlBarcodePrefix: ""
};

export async function getUserSettings(params: {
  userId: string;
  storeId: string;
}): Promise<UserSettingsData> {
  try {
    const anyPrisma = prisma as any;

    if (!anyPrisma.userSettings || typeof anyPrisma.userSettings.findUnique !== "function") {
      console.warn("UserSettings modeli Prisma client'ta bulunamadı.");
      return DEFAULT_SETTINGS;
    }

    const settings = await anyPrisma.userSettings.findUnique({
      where: { storeId: params.storeId }
    });

    if (!settings) {
      return DEFAULT_SETTINGS;
    }

    return {
      companyName: settings.companyName ?? "",
      defaultCurrency: settings.defaultCurrency ?? "TRY",
      defaultVatRate: settings.defaultVatRate ?? 20,
      defaultCommissionRate: settings.defaultCommissionRate,
      defaultCargoCost: settings.defaultCargoCost,
      defaultTargetProfitRate: settings.defaultTargetProfitRate,
      defaultDesi: settings.defaultDesi ?? 1,
      fallbackBrand: settings.fallbackBrand ?? "",
      fallbackCategory: settings.fallbackCategory ?? "",
      xmlBarcodePrefix: settings.xmlBarcodePrefix ?? ""
    };
  } catch (err) {
    console.error("getUserSettings error:", err);
    return DEFAULT_SETTINGS;
  }
}
