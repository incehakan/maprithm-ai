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
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

async function main() {
  loadEnv();
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL missing");

  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

  try {
    const rows = await prisma.$queryRawUnsafe(`
      SELECT
        a.pid,
        a.usename,
        a.application_name,
        a.state,
        a.query
      FROM pg_locks l
      JOIN pg_stat_activity a ON a.pid = l.pid
      WHERE l.locktype = 'advisory'
        AND l.granted = true;
    `);

    const migrateLockRows = await prisma.$queryRawUnsafe(`
      SELECT
        a.pid,
        a.usename,
        a.application_name,
        a.state,
        a.query
      FROM pg_locks l
      JOIN pg_stat_activity a ON a.pid = l.pid
      WHERE l.locktype = 'advisory'
        AND l.granted = true
        AND (l.objid = 72707369 OR l.classid = 72707369);
    `);

    console.log("All granted advisory locks:", rows);
    console.log("Prisma migrate advisory lock candidates:", migrateLockRows);

    // If we find candidate PIDs, terminate them.
    const pids = Array.isArray(migrateLockRows)
      ? migrateLockRows.map((r) => r.pid).filter(Boolean)
      : [];

    if (!pids.length) {
      console.log("No migrate lock holder found.");
      return;
    }

    for (const pid of pids) {
      console.log("Terminating backend pid", pid);
      const res = await prisma.$queryRawUnsafe(
        `SELECT pg_terminate_backend(${Number(pid)}) as terminated`
      );
      console.log(res);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

