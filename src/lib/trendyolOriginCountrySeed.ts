import originCountries from "@/data/trendyol-origin-countries.json";

export type TrendyolOriginCountryEntry = { code: string; name: string };

/** Resmi Trendyol V1 createProducts menşei kod listesi (developers.trendyol.com/docs/ürün-menşei-değerleri). */
export const OFFICIAL_TRENDYOL_ORIGIN_COUNTRIES: TrendyolOriginCountryEntry[] =
  originCountries as TrendyolOriginCountryEntry[];

const nameToCode = new Map(
  OFFICIAL_TRENDYOL_ORIGIN_COUNTRIES.map((c) => [
    c.name.trim().toLocaleLowerCase("tr-TR"),
    c.code
  ])
);

export function resolveOriginCodeFromApiName(name: string): string | null {
  const key = name.trim().toLocaleLowerCase("tr-TR");
  return nameToCode.get(key) ?? null;
}
