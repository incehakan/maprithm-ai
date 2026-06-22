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

async function main() {
  loadEnv();
  const apply = process.argv.includes("--apply");
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();

  try {
    const approved = await prisma.productMarketplaceMapping.count({
      where: { publishStatus: "published" }
    });
    const unapproved = await prisma.productMarketplaceMapping.count({
      where: { publishStatus: { not: "published" } }
    });

    console.log(
      `[backfill-mapping-approval-state] published→APPROVED: ${approved}, other→UNAPPROVED: ${unapproved}`
    );

    if (!apply) {
      console.log("Dry-run. Uygulamak için: node scripts/backfill-mapping-approval-state.js --apply");
      return;
    }

    const r1 = await prisma.productMarketplaceMapping.updateMany({
      where: { publishStatus: "published" },
      data: { approvalState: "APPROVED" }
    });
    const r2 = await prisma.productMarketplaceMapping.updateMany({
      where: { publishStatus: { not: "published" } },
      data: { approvalState: "UNAPPROVED" }
    });

    console.log(`Güncellendi: APPROVED=${r1.count}, UNAPPROVED=${r2.count}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
