import type { RawSignal } from "../types.js";
import { PER_SOURCE_LIMIT } from "../config.js";

/** Product Hunt 搜索：看竞品/相关产品的用户反馈（tagline + 评论数）。 */
export async function fetchProductHunt(query: string): Promise<RawSignal[]> {
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
      locale: "en-US",
    });
    const page = await context.newPage();
    await page.goto(
      `https://www.producthunt.com/search?q=${encodeURIComponent(query)}`,
      { waitUntil: "domcontentloaded", timeout: 30_000 }
    );
    await page.waitForTimeout(2500);

    const products = await page.evaluate((limit: number) => {
      const links = Array.from(
        document.querySelectorAll('a[href*="/products/"], a[href*="/posts/"]')
      ).slice(0, limit * 2);
      const seen = new Set<string>();
      const out: { id: string; title: string; desc: string; url: string }[] = [];
      for (const el of links) {
        const a = el as HTMLAnchorElement;
        const url = a.href;
        if (seen.has(url)) continue;
        seen.add(url);
        const card = a.closest("section, li, div[class]") ?? a;
        const titleEl = card.querySelector("h3, h2") as HTMLElement | null;
        const descEl = card.querySelector("p") as HTMLElement | null;
        out.push({
          id: url,
          title: titleEl?.innerText?.trim() ?? a.innerText?.trim() ?? "",
          desc: descEl?.innerText?.trim() ?? "",
          url,
        });
        if (out.length >= limit) break;
      }
      return out;
    }, PER_SOURCE_LIMIT);

    return products
      .map((p): RawSignal | null => {
        const text = (p.desc || p.title).trim();
        if (!text || !p.id) return null;
        return {
          source: "producthunt",
          sourceId: p.id,
          url: p.url || null,
          title: p.title || "Product Hunt",
          rawText: text,
          query,
        };
      })
      .filter((r): r is RawSignal => r !== null);
  } finally {
    await browser.close();
  }
}
