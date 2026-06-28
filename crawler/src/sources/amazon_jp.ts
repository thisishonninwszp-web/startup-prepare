import type { RawSignal } from "../types.js";
import { PER_SOURCE_LIMIT } from "../config.js";

/**
 * 亚马逊日本：搜关键词 → 取前 3 个商品的评论页 → 抽评论正文。
 * 差评（1-3 星）是最好的痛点信号。
 * Amazon 有反爬，失败时自动跳过——不拖垮整轮。
 */
export async function fetchAmazonJP(query: string): Promise<RawSignal[]> {
  let chromium: typeof import("playwright").chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    throw new Error("未安装 Playwright。运行 `npm i playwright && npx playwright install chromium`。");
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      locale: "ja-JP",
      extraHTTPHeaders: { "Accept-Language": "ja-JP,ja;q=0.9" },
    });
    const page = await context.newPage();

    // 1. 搜索结果页，取前 3 个 ASIN
    await page.goto(
      `https://www.amazon.co.jp/s?k=${encodeURIComponent(query)}&language=ja_JP`,
      { waitUntil: "domcontentloaded", timeout: 30_000 }
    );
    const asins = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[data-asin]"))
        .map((el) => el.getAttribute("data-asin") ?? "")
        .filter(Boolean)
        .slice(0, 3)
    );

    const signals: RawSignal[] = [];
    const perProduct = Math.max(2, Math.floor(PER_SOURCE_LIMIT / Math.max(asins.length, 1)));

    // 2. 对每个商品抓评论页
    for (const asin of asins) {
      await new Promise((r) => setTimeout(r, 1200 + Math.random() * 800));
      try {
        await page.goto(
          `https://www.amazon.co.jp/product-reviews/${asin}?reviewerType=all_reviews&sortBy=recent`,
          { waitUntil: "domcontentloaded", timeout: 20_000 }
        );
        const reviews = await page.evaluate((limit: number) =>
          Array.from(document.querySelectorAll('[data-hook="review"]'))
            .slice(0, limit)
            .map((el) => ({
              id: el.id ?? "",
              title:
                (el.querySelector('[data-hook="review-title"] span:last-child') as HTMLElement | null)
                  ?.innerText?.trim() ?? "",
              body:
                (el.querySelector('[data-hook="review-body"] span') as HTMLElement | null)
                  ?.innerText?.trim() ?? "",
            })), perProduct
        );
        for (const r of reviews) {
          const text = (r.body || r.title).trim();
          if (!text) continue;
          signals.push({
            source: "amazon_jp",
            sourceId: r.id ? `${asin}_${r.id}` : `${asin}_${signals.length}`,
            url: `https://www.amazon.co.jp/dp/${asin}`,
            title: r.title || `Amazon レビュー`,
            rawText: text,
            query,
          });
        }
      } catch {
        // 单商品失败跳过
      }
    }
    return signals;
  } finally {
    await browser.close();
  }
}
