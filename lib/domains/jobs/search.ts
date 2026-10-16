import { webSearch } from "@/lib/web-search";
import { extractPostingFacts, type ExtractedPosting } from "@/lib/ai";
import { getJobProfile, markSearched, MISSING_MIGRATION } from "./profile";
import { cleanOldCandidates, knownUrls, readJobPage, savePosting } from "./postings";
import { ATS_HOSTS, atsOf, careerQuery, JOB_CATEGORIES, locationVerdict, normalizeUrl, pickCandidates, searchQuery, tokyoDate } from "./shared";

/**
 * 每天搜岗位：每类搜两次（一般的一次、只搜公司招聘系统页面的一次，最多 8 次），每类读前 3 页
 * （招聘系统的页面优先，最多占 2 页 —— 这类不用登录就能应募，填表助手对付得了），
 * 抽岗位、按地点过滤、四类轮流留最多 8 条候选。
 * 在打开 /jobs 的那个 server action 里跑（60 秒）：7 点的定时任务已经没有余量。
 * AI 抽岗位一次最多并发 4 个，免得撞 Gemini 的限流。
 */

const PAGES_PER_CATEGORY = 3;
const CAREER_PAGES_PER_CATEGORY = 2;
const CONCURRENCY = 4;

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    out.push(...(await Promise.all(items.slice(i, i + limit).map(fn))));
  }
  return out;
}

type Posting = Extract<ExtractedPosting, { is_posting: true }>;
type Analyzed = { url: string; body: string; extracted: Posting; category: Posting["category"] };

export async function runDailyJobSearch(userId: string, today = tokyoDate()): Promise<{ read: number; kept: number; skipped: string[] }> {
  const profile = await getJobProfile(userId);
  if (profile === "missing-schema") throw new Error(MISSING_MIGRATION);
  if (!profile) throw new Error("先在「条件」里把要找的几类和地点填好。");
  // 先记上今天搜过：两个标签页同时打开不会搜两遍；没搜成的话页面上有"再搜一次"
  await markSearched(userId, today);
  await cleanOldCandidates(userId, today);

  const skipped: string[] = [];
  const perCategory = await Promise.all(
    profile.categories.map(async (category) => {
      const [general, career] = await Promise.all([
        webSearch(searchQuery(category, profile.locations), 5).catch(() => null),
        webSearch(careerQuery(category, profile.locations), 5, { domains: ATS_HOSTS }).catch(() => null),
      ]);
      if (!general && !career) {
        skipped.push(`${JOB_CATEGORIES[category]}：没搜成`);
        return [];
      }
      const careerUrls = (career ?? [])
        .map((r) => normalizeUrl(r.url))
        .filter((u) => atsOf(u) !== null)
        .slice(0, CAREER_PAGES_PER_CATEGORY);
      const generalUrls = (general ?? []).map((r) => normalizeUrl(r.url));
      return Array.from(new Set([...careerUrls, ...generalUrls])).slice(0, PAGES_PER_CATEGORY);
    })
  );
  const urls = Array.from(new Set(perCategory.flat()));
  const known = await knownUrls(userId, urls);
  const fresh = urls.filter((u) => !known.has(u));

  const analyzed = (
    await mapLimit(fresh, CONCURRENCY, async (url): Promise<Analyzed | null> => {
      const page = await readJobPage(url).catch(() => null);
      if (!page || !page.ok) return null;
      try {
        const extracted = await extractPostingFacts(userId, page.body);
        return extracted.is_posting ? { url: page.url, body: page.body, extracted, category: extracted.category } : null;
      } catch {
        return null;
      }
    })
  )
    .filter((x): x is Analyzed => x !== null)
    .filter((x) => locationVerdict(x.extracted.facts.location, x.extracted.facts.remote, profile.locations) !== "drop");

  let kept = 0;
  for (const item of pickCandidates(analyzed, profile.categories)) {
    const saved = await savePosting(userId, item.extracted, { body: item.body, url: item.url, source: "search", picked: false, foundOn: today });
    if (!saved.existed) kept += 1;
  }
  return { read: analyzed.length, kept, skipped };
}
