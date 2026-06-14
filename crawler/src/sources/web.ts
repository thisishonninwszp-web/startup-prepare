import type { RawSignal, SourceFetcher } from "../types.js";

/**
 * 通用网页兜底源（反爬最重的部分隔离在这里）。
 * 这里的 query 是一个 URL：用 Playwright 渲染后抽正文。
 * Playwright 是 optionalDependency——没装就给出明确提示，不拖垮其它 API 源。
 *
 * 用法：tsx src/cli.ts --source web --query "https://example.com/thread"
 */
export const fetchWeb: SourceFetcher = async (query) => {
  const url = query.trim();
  if (!/^https?:\/\//i.test(url)) {
    throw new Error("web 源的 query 必须是一个 http(s) URL。");
  }

  let chromium: typeof import("playwright").chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    throw new Error(
      "未安装 Playwright。运行 `npm i playwright && npx playwright install chromium` 后再用 web 源。"
    );
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const title = await page.title();
    // 抽 body 可见文本，压缩空白。粗暴但够用——精细抽取留给后续。
    const text = (
      await page.evaluate(() => document.body?.innerText ?? "")
    )
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 4000);

    if (!text) return [];

    const signal: RawSignal = {
      source: "web",
      sourceId: url,
      url,
      title: title || url,
      rawText: text,
      query: url,
    };
    return [signal];
  } finally {
    await browser.close();
  }
};
