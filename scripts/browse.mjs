// 헤드리스 Edge로 앱을 구동해 검증 플로우 전체를 확인하는 스모크 드라이버
import { chromium } from "playwright-core";

const SHOT_DIR = process.argv[2] ?? ".";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1100, height: 900 } })).newPage();

const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto("http://localhost:5173", { waitUntil: "networkidle" });
await page.waitForSelector("text=CiteGuard", { timeout: 15000 }).catch(() => {});
await page.screenshot({ path: `${SHOT_DIR}/01-initial.png`, fullPage: true });

// 예시 넣기 → 검증하기
await page.click('button:has-text("예시 넣기")');
await page.screenshot({ path: `${SHOT_DIR}/02-example.png`, fullPage: true });
await page.click('button:has-text("검증하기")');

// 결과 대기 (실제 API 호출 — 넉넉히)
await page.waitForSelector(".summary", { timeout: 120000 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${SHOT_DIR}/03-results.png`, fullPage: true });

// 요약 칩 텍스트 출력
const chips = await page.$$eval(".chip", (els) => els.map((e) => e.textContent?.trim()));
console.log("SUMMARY:", chips.join(" | "));
const badges = await page.$$eval(".badge", (els) => els.map((e) => e.textContent?.trim()));
console.log("BADGES:", badges.join(" | "));
console.log("CONSOLE_ERRORS:", errors.length ? errors.join("\n") : "(none)");

await browser.close();
