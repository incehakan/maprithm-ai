import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.env.SCREENSHOT_BASE_URL || "http://localhost:3001";
const EMAIL = process.env.SUPERUSER_EMAIL || "hakanince10@gmail.com";
const PASSWORD = process.env.SUPERUSER_PASSWORD || "Hkn.100508";
const OUT = "docs/screenshots";

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.locator("#email").fill(EMAIL);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await page.waitForURL(/\/(dashboard|register-store)/, { timeout: 20000 });
}

async function openFirstListbox(page) {
  const trigger = page.locator('button[aria-haspopup="listbox"]').first();
  await trigger.waitFor({ state: "visible", timeout: 10000 });
  await trigger.click();
  await page.waitForTimeout(400);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  // Görev 1 — Ortam dropdown
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await login(page);
    await page.goto(`${BASE}/admin/system-connections`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await openFirstListbox(page);
    await page.screenshot({ path: `${OUT}/gorev1-ortam-dropdown.png`, fullPage: true });
    await page.close();
  }

  // Görev 2 — Sistem Bağlantıları UX
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await login(page);
    await page.goto(`${BASE}/admin/system-connections`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/gorev2-sistem-baglantilari.png`, fullPage: true });
    await page.close();
  }

  // Görev 3 — Mobil genişlikler
  for (const [name, width] of [
    ["375", 375],
    ["390", 390],
    ["768", 768]
  ]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    await login(page);
    await page.goto(`${BASE}/orders`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${OUT}/gorev3-orders-${name}px.png`, fullPage: true });

    await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${OUT}/gorev3-settings-${name}px.png`, fullPage: true });
    await page.close();
  }

  // Görev 4 — Türkçe panel
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await login(page);
    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${OUT}/gorev4-panel.png`, fullPage: true });
    await page.goto(`${BASE}/not-a-real-page`, { waitUntil: "networkidle" });
    await page.screenshot({ path: `${OUT}/gorev4-not-found.png`, fullPage: true });
    await page.close();
  }

  await browser.close();
  console.log(`Screenshots saved under ${OUT}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
