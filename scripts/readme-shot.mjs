// README용 결과 화면 스크린샷. 운영 사이트에 예시 목록을 넣고 검증한 뒤,
// 조작 의심으로 판정된 카드를 펼친 상태로 요약 스트립부터 결과 목록까지 찍는다.
// 사용: node scripts/readme-shot.mjs [출력 파일] [URL]
import { chromium } from "playwright-core";

const OUT = process.argv[2] ?? "docs/results.png";
const BASE_URL = process.argv[3] ?? "https://realcite.pages.dev";

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await (
  await browser.newContext({ viewport: { width: 960, height: 900 }, deviceScaleFactor: 2 })
).newPage();

await page.goto(BASE_URL, { waitUntil: "networkidle" });
await page.click('button:has-text("예시 넣기")');
await page.click('button:has-text("검증하기")');
await page.waitForSelector(".summary", { timeout: 180000 });
await page.waitForFunction(() => document.querySelectorAll(".badge-pending").length === 0, null, {
  timeout: 180000,
});
await page.waitForTimeout(500);

// 조작 의심 카드를 펼쳐 근거(판정 사유, 조회 소스)가 보이게 한다
const major = page.locator(".card.verdict-major .card-head").first();
if (await major.count()) await major.click();
await page.waitForTimeout(300);

const top = await page.locator(".summary").boundingBox();
const bottom = await page.locator(".results").boundingBox();
if (!top || !bottom) throw new Error("결과 영역을 찾지 못했습니다");
const pad = 8;
await page.screenshot({
  path: OUT,
  fullPage: true,
  clip: {
    x: top.x - pad,
    y: top.y - pad,
    width: top.width + pad * 2,
    height: bottom.y + bottom.height - top.y + pad * 2,
  },
});
const chips = await page.$$eval(".chip", (els) => els.map((e) => e.textContent?.trim()));
console.log("저장:", OUT);
console.log("요약:", chips.join(" | "));
await browser.close();
