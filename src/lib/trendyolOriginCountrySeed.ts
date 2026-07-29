import iso3166Countries from "@/data/iso3166-alpha2-countries.json";

export type OriginCountryEntry = { code: string; name: string };

/** ISO 3166-1 alpha-2 ülke kodları — Trendyol createProducts origin alanı ile uyumlu. */
export const ISO3166_ALPHA2_COUNTRIES: OriginCountryEntry[] =
  iso3166Countries as OriginCountryEntry[];
