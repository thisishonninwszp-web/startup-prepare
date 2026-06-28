import type { RawSignal } from "../types.js";
import { PER_SOURCE_LIMIT } from "../config.js";

/** Indie Hackers 搜索：独立创业者的真实痛点/复盘帖。 */
export async function fetchIndieHackers(query: string): Promise<RawSignal[]> {
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
      `https://www.indiehackers.com/search?query=${encodeURIComponent(query)}`,
      { waitUntil: "domcontentloaded", timeout: 30_000 }
    );
    await page.waitForTimeout(2500);

    const posts = await page.evaluate((limit: number) => {
      const links = Array.from(
        document.querySelectorAll('a[href*="/post/"]')
      ).slice(0, limit * 2);
      const seen = new Set<string>();
      const out: { id: string; title: string; desc: string; url: string }[] = [];
      for (const el of links) {
        const a = el as HTMLAnchorElement;
        const url = a.href;
        if (seen.has(url)) continue;
        seen.add(url);
        const card = a.closest("article, li, div[class]") ?? a;
        const titleEl = card.querySelector("h2, h3") as HTMLElement | null;
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

    return posts
      .map((p): RawSignal | null => {
        const text = (p.desc || p.title).trim();
        if (!text || !p.id) return null;
        return {
          source: "indiehackers",
          sourceId: p.id,
          url: p.url || null,
          title: p.title || "Indie Hackers",
          rawText: text,
          query,
        };
      })
      .filter((r): r is RawSignal => r !== null);
  } finally {
    await browser.close();
  }
}
