import type { RawSignal } from "../types.js";
import { PER_SOURCE_LIMIT } from "../config.js";

/**
 * 小红书搜索（Playwright 渲染）：消费类内容最密集的中文平台。
 * 需先安装：npm i playwright && npx playwright install chromium
 * query 是搜索关键词（支持中文）。
 */
export async function fetchXiaohongshu(query: string): Promise<RawSignal[]> {
  let chromium: typeof import("playwright").chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    throw new Error(
      "未安装 Playwright。运行 `npm i playwright && npx playwright install chromium`。"
    );
  }

  const searchUrl = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(query)}&source=web_explore_feed`;

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      locale: "zh-CN",
    });
    const page = await context.newPage();
    await page.goto(searchUrl, { waitUntil: "networkidle", timeout: 30_000 });

    // 等待笔记卡片出现
    await page.waitForSelector("section.note-item, .note-list .note", {
      timeout: 10_000,
    }).catch(() => null);

    const notes = await page.evaluate((limit: number) => {
      const cards = Array.from(
        document.querySelectorAll("section.note-item, .note-list .note, a[href*='/explore/']")
      ).slice(0, limit);
      return cards.map((el) => {
        const title =
          (el.querySelector(".title, .note-title, h3") as HTMLElement | null)
            ?.innerText?.trim() ?? "";
        const desc =
          (el.querySelector(".desc, .note-desc, p") as HTMLElement | null)
            ?.innerText?.trim() ?? "";
        const href = (el as HTMLAnchorElement).href ?? el.querySelector("a")?.href ?? "";
        const id = href.match(/\/explore\/([a-f0-9]+)/)?.[1] ?? href;
        return { id, title, desc, href };
      });
    }, PER_SOURCE_LIMIT);

    return notes
      .map((n): RawSignal | null => {
        const text = (n.desc || n.title).trim();
        if (!n.id || !text) return null;
        return {
          source: "xiaohongshu",
          sourceId: n.id,
          url: n.href || null,
          title: n.title || "小红书笔记",
          rawText: text,
          query,
        };
      })
      .filter((r): r is RawSignal => r !== null);
  } finally {
    await browser.close();
  }
}
