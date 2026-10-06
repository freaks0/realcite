// 고급 설정 UI 스크린샷
import { chromium } from "playwright-core";

const SHOT_DIR = process.argv[2] ?? ".";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1100, height: 900 } })).newPage();
await page.goto("http://localhost:5173", { waitUntil: "networkidle" });
await page.click("summary:has-text('고급 설정')");
await page.fill("#oa-key", "test-key-123");
await page.waitForTimeout(200);
await page.screenshot({ path: `${SHOT_DIR}/05-settings.png` });
const saved = await page.evaluate(() => localStorage.getItem("citeguard.openalexApiKey"));
console.log("localStorage 저장:", saved);
await browser.close();
