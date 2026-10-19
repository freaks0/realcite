// README용 스크린샷. 운영 사이트를 밝은 테마와 어두운 테마로 각각 열어
// 1) 예시를 넣은 메인 화면, 2) 검증 결과(조작 의심 카드를 펼친 상태)를 찍는다.
// 결과: <폴더>/main-light.png, main-dark.png, results-light.png, results-dark.png
// 사용: node scripts/readme-shot.mjs [출력 폴더] [URL]
import { chromium } from "playwright-core";

const OUT_DIR = process.argv[2] ?? "docs";
const BASE_URL = process.argv[3] ?? "https://realcite.pages.dev";

const browser = await chromium.launch({ channel: "msedge", headless: true });

async function shoot(colorScheme) {
  const page = await (
    await browser.newContext({ viewport: { width: 960, height: 900 }, deviceScaleFactor: 2, colorScheme })
  ).newPage();

  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.click('button:has-text("예시 넣기")');
  await page.waitForTimeout(300);

  // 1) 메인 화면: 헤더부터 입력 패널까지
  const header = await page.locator("header").boundingBox();
  const panel = await page.locator(".input-panel").boundingBox();
  if (!header || !panel) throw new Error("메인 화면 영역을 찾지 못했습니다");
  const pad = 16;
  await page.screenshot({
    path: `${OUT_DIR}/main-${colorScheme}.png`,
    fullPage: true,
    clip: {
      x: panel.x - pad,
      y: header.y - pad,
      width: panel.width + pad * 2,
      height: panel.y + panel.height - header.y + pad * 2,
    },
  });

  // 2) 결과 화면: 검증 후 요약 스트립부터 결과 목록까지
  await page.click('button:has-text("검증하기")');
  await page.waitForSelector(".summary", { timeout: 180000 });
  await page.waitForFunction(() => document.querySelectorAll(".badge-pending").length === 0, null, {
    timeout: 180000,
  });
  await page.waitForTimeout(500);
  const major = page.locator(".card.verdict-major .card-head").first();
  if (await major.count()) await major.click();
  await page.waitForTimeout(300);

  const top = await page.locator(".summary").boundingBox();
  const bottom = await page.locator(".results").boundingBox();
  if (!top || !bottom) throw new Error("결과 영역을 찾지 못했습니다");
  await page.screenshot({
    path: `${OUT_DIR}/results-${colorScheme}.png`,
    fullPage: true,
    clip: {
      x: top.x - pad,
      y: top.y - pad,
      width: top.width + pad * 2,
      height: bottom.y + bottom.height - top.y + pad * 2,
    },
  });
  const chips = await page.$$eval(".chip", (els) => els.map((e) => e.textContent?.trim()));
  console.log(`${colorScheme}: 저장 완료. 요약: ${chips.join(" | ")}`);
}

await shoot("dark");
await shoot("light");
await browser.close();
