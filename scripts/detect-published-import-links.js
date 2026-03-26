const { PrismaClient } = require("@prisma/client");

async function main() {
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRawUnsafe(`
      SELECT
        p.id as "productId",
        p.name as "productName",
        p.sku as "productSku",
        m.barcode as "mappingBarcode",
        m."publishStatus" as "publishStatus",
        j.id as "importJobId",
        j."originalFileName" as "importFile",
        r.id as "importRowId",
        r."normalizedSku" as "rowSku",
        r."normalizedBarcode" as "rowBarcode"
      FROM "Product" p
      JOIN "ProductMarketplaceMapping" m
        ON m."productId" = p.id
       AND m.platform = 'trendyol'
       AND m."publishStatus" = 'published'
      LEFT JOIN "ImportRow" r
        ON (
          NULLIF(TRIM(LOWER(COALESCE(p.sku, ''))), '') IS NOT NULL
          AND NULLIF(TRIM(LOWER(COALESCE(r."normalizedSku", ''))), '') = NULLIF(TRIM(LOWER(COALESCE(p.sku, ''))), '')
        )
        OR (
          NULLIF(TRIM(LOWER(COALESCE(m.barcode, ''))), '') IS NOT NULL
          AND NULLIF(TRIM(LOWER(COALESCE(r."normalizedBarcode", ''))), '') = NULLIF(TRIM(LOWER(COALESCE(m.barcode, ''))), '')
        )
      LEFT JOIN "ImportJob" j
        ON j.id = r."importJobId"
      WHERE p."sourceImportJobId" IS NULL
      ORDER BY p.name ASC
      LIMIT 500
    `);

    console.log(JSON.stringify(rows, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
