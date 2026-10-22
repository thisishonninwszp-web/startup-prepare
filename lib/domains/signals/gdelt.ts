import { gdeltWindow, parseGdelt, type HistoryNews } from "./history-shared";

/**
 * GDELT（免费的全球新闻索引，api.gdeltproject.org，不用 Key）：只取某一天以前的新闻标题。
 * 历史回测用 —— AI 和他看到的都只是「那天」以前的新闻，答案漏不进来。
 * GDELT 要求一次请求隔 5 秒以上；查不到、查错了都返回空，不拦着别的。
 */

const GAP_MS = 5_500;
let lastCall = 0;

export async function gdeltNews(query: string, asOf: string): Promise<HistoryNews[]> {
  const wait = lastCall + GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  const { start, end } = gdeltWindow(asOf);
  const url =
    "https://api.gdeltproject.org/api/v2/doc/doc?mode=artlist&format=json&sort=hybridrel&maxrecords=40" +
    `&query=${encodeURIComponent(query)}&startdatetime=${start}&enddatetime=${end}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { "User-Agent": "IdeaOS/1.0" } });
    if (!res.ok) return [];
    // 查询写得不对时 GDELT 回的是一句话而不是 JSON
    const text = await res.text();
    return parseGdelt(JSON.parse(text), asOf);
  } catch {
    return [];
  }
}
