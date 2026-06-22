/**
 * normalizeLineVatBase manuel doğrulama (test runner yok).
 * Çalıştır: node scripts/manual-test-vat-rate.js
 */

function normalizeLineVatBase(line) {
  const v = line.vatRate ?? line.vatBaseAmount ?? line.vatBase ?? line.vatAmount;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)))
    return Number(v);
  return null;
}

const cases = [
  {
    name: "sadece vatRate dolu",
    line: { vatRate: 20 },
    expected: 20
  },
  {
    name: "sadece eski vatBaseAmount dolu",
    line: { vatBaseAmount: 18 },
    expected: 18
  },
  {
    name: "hiçbiri dolu değil",
    line: { quantity: 1 },
    expected: null
  }
];

let failed = 0;
for (const c of cases) {
  const got = normalizeLineVatBase(c.line);
  const ok = got === c.expected;
  console.log(`${ok ? "OK" : "FAIL"} — ${c.name}: got=${got}, expected=${c.expected}`);
  if (!ok) failed++;
}

if (failed > 0) {
  console.error(`\n${failed} senaryo başarısız.`);
  process.exit(1);
}
console.log("\nTüm senaryolar geçti.");
