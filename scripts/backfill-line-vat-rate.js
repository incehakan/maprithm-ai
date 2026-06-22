const fs = require("fs");
const path = require("path");

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (value && process.env[key] === undefined) process.env[key] = value;
  }
}

function extractVatFromRaw(raw) {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const v =
    raw.vatRate ?? raw.vatBaseAmount ?? raw.vatBase ?? raw.vatAmount;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)))
    return Number(v);
  return null;
}

async function main() {
  loadEnv();
  const apply = process.argv.includes("--apply");
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();

  try {
    const rows = await prisma.marketplaceOrderLine.findMany({
      where: {
        vatBaseAmount: null,
        rawData: { not: null }
      },
      select: { id: true, rawData: true }
    });

    const updates = [];
    for (const row of rows) {
      const vat = extractVatFromRaw(row.rawData);
      if (vat != null) {
        updates.push({ id: row.id, vatBaseAmount: vat });
      }
    }

    console.log(`Toplam aday satır (vatBaseAmount IS NULL, rawData dolu): ${rows.length}`);
    console.log(`Güncellenebilir satır (rawData'da VAT bulundu): ${updates.length}`);

    if (!apply) {
      console.log("\nDry-run modu. Gerçek güncelleme için: node scripts/backfill-line-vat-rate.js --apply");
      if (updates.length > 0 && updates.length <= 10) {
        console.log("Örnek:", updates.slice(0, 5));
      }
      return;
    }

    let updated = 0;
    for (const u of updates) {
      await prisma.marketplaceOrderLine.update({
        where: { id: u.id },
        data: { vatBaseAmount: u.vatBaseAmount }
      });
      updated++;
    }
    console.log(`\nGüncellenen satır: ${updated}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
