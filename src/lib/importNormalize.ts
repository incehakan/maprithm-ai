/**
 * Ham satır (CSV / XLSX / XML düzleştirilmiş) kayıttan ImportRow normalize alanları.
 * Alan eşlemesi: importFlexibleFieldMap (XML’de değişken etiket adları için kısmi eşleşme).
 */

import {
  pickStringByAliases,
  pickNumberByAliases
} from "./importFlexibleFieldMap";
import { extractImageUrls } from "./productImages";

const NAME_ALIASES = [
  "name",
  "urun adi",
  "title",
  "productname",
  "product_name",
  "product name",
  "isim",
  "ad",
  "producttitle",
  "baslik",
  "baslık",
  "label"
];

const DESC_ALIASES = [
  "description",
  "aciklama",
  "açıklama",
  "desc",
  "detail",
  "details",
  "productdescription",
  "longdescription",
  "shortdescription",
  "summary"
];

const BRAND_ALIASES = [
  "brand",
  "marka",
  "manufacturer",
  "uretici",
  "üretici",
  "vendor",
  "make"
];

const CATEGORY_ALIASES = [
  "category",
  "kategori",
  "categorytext",
  "category_text",
  "productcategory",
  "producttype",
  "department",
  "group"
];

const SKU_ALIASES = [
  "sku",
  "stok kodu",
  "stokkodu",
  "stockcode",
  "stock_code",
  "productcode",
  "product_code",
  "kod",
  "code",
  "model",
  "modelno",
  "suppliercode"
];

const BARCODE_ALIASES = [
  "barcode",
  "barkod",
  "ean",
  "gtin",
  "upc",
  "barkodno",
  "isbn"
];

const PRICE_ALIASES = [
  "price",
  "fiyat",
  "listprice",
  "list_price",
  "saleprice",
  "sale_price",
  "unitprice",
  "unit_price",
  "retailprice",
  "amount"
];

const STOCK_ALIASES = [
  "stock",
  "stok",
  "quantity",
  "qty",
  "adet",
  "miktar",
  "inventory",
  "available",
  "onhand"
];

export type NormalizedImportFields = {
  normalizedName?: string;
  normalizedDescription?: string;
  normalizedBrand?: string;
  normalizedCategoryText?: string;
  normalizedSku?: string;
  normalizedBarcode?: string;
  mainImageUrl?: string;
  imageUrls?: string[];
  price?: number;
  stock?: number;
  rowStatus: "normalized" | "pending";
};

export function normalizeImportRow(
  raw: Record<string, unknown>
): NormalizedImportFields {
  const normalizedName = pickStringByAliases(raw, NAME_ALIASES);
  const normalizedDescription = pickStringByAliases(raw, DESC_ALIASES);
  const normalizedBrand = pickStringByAliases(raw, BRAND_ALIASES);
  const normalizedCategoryText = pickStringByAliases(raw, CATEGORY_ALIASES);
  const normalizedSku = pickStringByAliases(raw, SKU_ALIASES);
  const normalizedBarcode = pickStringByAliases(raw, BARCODE_ALIASES);
  const imageUrls = extractImageUrls(raw);
  const mainImageUrl = imageUrls[0];
  const price = pickNumberByAliases(raw, PRICE_ALIASES, "float");
  const stock = pickNumberByAliases(raw, STOCK_ALIASES, "int");

  const hasSignal =
    !!normalizedName ||
    !!normalizedSku ||
    !!normalizedBarcode ||
    price != null ||
    stock != null;

  return {
    normalizedName,
    normalizedDescription,
    normalizedBrand,
    normalizedCategoryText,
    normalizedSku,
    normalizedBarcode,
    mainImageUrl,
    imageUrls,
    price,
    stock,
    rowStatus: hasSignal ? "normalized" : "pending"
  };
}
