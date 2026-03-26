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
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();

  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true }
    });

    for (const u of users.slice(0, 10)) {
      const memberships = await prisma.storeMembership.findMany({
        where: { userId: u.id, isActive: true },
        select: { id: true, storeId: true, roleId: true }
      });

      console.log({
        userId: u.id,
        email: u.email,
        membershipCount: memberships.length,
        membershipStoreIds: memberships.map((m) => m.storeId)
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

