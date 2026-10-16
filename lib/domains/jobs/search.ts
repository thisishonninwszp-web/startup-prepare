import { fetchPublicPage } from "@/app/(app)/materials/fetch-page";
import { webSearch } from "@/lib/web-search";
import { extractPostingFacts, type ExtractedPosting } from "@/lib/ai";
import { getJobProfile, markSearched, MISSING_MIGRATION } from "./profile";
import { cleanOldCandidates, knownUrls, readJobPage, savePosting } from "./postings";
import {
  ATS_HOSTS,
  atsOf,
  boardOf,
  boardQueryFor,
  careerQueryFor,
  DAILY_CANDIDATE_CAP,
  experienceVerdict,
  hireTypeOrder,
  JOB_CATEGORIES,
  jobDetailUrl,
  jobLinks,
  locationVerdict,
  normalizeUrl,
  PER_CATEGORY_CAP,
  pickCandidates,
  pickJobLinks,
  tokyoDate,
  variantsFrom,
  type JobCategory,
} from "./shared";

/**
 * 搜岗位。两档：
 * - 快搜（打开 /jobs 时在 server action 里跑，60 秒）：每类用今天轮到的一个说法，先搜公司招聘系统（HRMOS、HERP 等，
 *   不用登录就能应募，填表助手对付得了）；招聘系统找到的不够 2 个，再用一般搜索看求人网站。最多留 8 条。
 * - 大搜（他电脑上的填表助手每天第一次开起来时跑，没有时间限制）：每类用两个说法，招聘系统和求人网站都搜，
 *   每类最多读 20 页，最多留 40 条。
 * 搜到的是列表页（公司的职位列表、求人网站的搜索结果）就顺着里面职位名对得上这一类的链接读单个岗位。
 * 抽完按地点、经验要求、招哪种人过滤（按事实筛，不打分），四类轮流取。
 * 招聘系统用 Tavily 限定域名（Gemini 的 Google 不理会 site:，Tavily 一个月一千次左右，所以大搜也只用两个说法）；
 * 求人网站用一般搜索（Google 本来就会给出 doda、マイナビ的列表页）。
 */

export type SearchLimits = {
  /** 每类用几个说法（从今天轮到的那个往后数）。 */
  variants: number;
  pagesPerCategory: number;
  listPagesToOpen: number;
  linksPerListPage: number;
  cap: number;
  perCat: number;
  /** true = 求人网站总是也搜；false = 招聘系统找到的不够 2 个才搜。 */
  boards: boolean;
};

export const QUICK_SEARCH: SearchLimits = {
  variants: 1,
  pagesPerCategory: 4,
  listPagesToOpen: 3,
  linksPerListPage: 3,
  cap: DAILY_CANDIDATE_CAP,
  perCat: PER_CATEGORY_CAP,
  boards: false,
};

// 读到的岗位约一半会因为地点、经验要求被筛掉（2026-10-17 试过），所以每类多读一些
export const BIG_SEARCH: SearchLimits = {
  variants: 2,
  pagesPerCategory: 20,
  listPagesToOpen: 8,
  linksPerListPage: 5,
  cap: 40,
  perCat: 12,
  boards: true,
};

const CONCURRENCY = 6;

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    out.push(...(await Promise.all(items.slice(i, i + limit).map(fn))));
  }
  return out;
}

type Posting = Extract<ExtractedPosting, { is_posting: true }>;
type Analyzed = { url: string; body: string; extracted: Posting; category: Posting["category"] };

/** 搜索结果分成单个岗位页和列表页；只要 accept 认的网站。 */
function split(results: ({ url: string }[] | null)[], accept: (url: string) => boolean): { details: string[]; lists: string[] } {
  const details: string[] = [];
  const lists: string[] = [];
  for (const r of results.flatMap((x) => x ?? [])) {
    const url = normalizeUrl(r.url);
    if (!accept(url)) continue;
    const detail = jobDetailUrl(url);
    if (detail) details.push(detail);
    else lists.push(url);
  }
  return { details, lists };
}

/** 打开列表页，挑职位名对得上这一类的单个岗位链接。 */
async function followLists(lists: string[], category: JobCategory, limits: SearchLimits): Promise<string[]> {
  const pages = await Promise.all(
    Array.from(new Set(lists))
      .slice(0, limits.listPagesToOpen)
      .map((list) => fetchPublicPage(list, (html) => html).catch(() => null))
  );
  return pages.flatMap((page) => (page?.ok ? pickJobLinks(jobLinks(page.body, page.finalUrl), category, limits.linksPerListPage) : []));
}

/** 这一类要读的几页：招聘系统的单个岗位和求人网站的单个岗位，两边都有时各占一半。 */
async function categoryUrls(
  category: JobCategory,
  locations: string[],
  today: string,
  limits: SearchLimits,
  skipped: string[]
): Promise<string[]> {
  const variants = variantsFrom(category, today, limits.variants);
  const careerResults = await Promise.all(
    variants.map((v) => webSearch(careerQueryFor(v, locations), 6, { domains: ATS_HOSTS }).catch(() => null))
  );
  const career = split(careerResults, (u) => atsOf(u) !== null);
  const ats = Array.from(new Set([...career.details, ...(await followLists(career.lists, category, limits))]));

  let boards: string[] = [];
  let boardResults: ({ url: string }[] | null)[] = [];
  if (limits.boards || ats.length < 2) {
    boardResults = await Promise.all(variants.map((v) => webSearch(boardQueryFor(v, locations), 6).catch(() => null)));
    const board = split(boardResults, (u) => boardOf(u) !== null);
    boards = Array.from(new Set([...board.details, ...(await followLists(board.lists, category, limits))]));
  }
  if ([...careerResults, ...boardResults].every((r) => r === null)) skipped.push(`${JOB_CATEGORIES[category]}：没搜成`);

  const atsQuota = boards.length > 0 ? Math.ceil(limits.pagesPerCategory / 2) : limits.pagesPerCategory;
  const picked = ats.slice(0, atsQuota);
  return [...picked, ...boards.slice(0, limits.pagesPerCategory - picked.length)];
}

async function runSearch(userId: string, today: string, limits: SearchLimits): Promise<{ read: number; kept: number; skipped: string[] }> {
  const profile = await getJobProfile(userId);
  if (profile === "missing-schema") throw new Error(MISSING_MIGRATION);
  if (!profile) throw new Error("先在「条件」里把要找的几类和地点填好。");
  // 先记上今天搜过：两个标签页同时打开不会搜两遍；没搜成的话页面上有"再搜一次"
  await markSearched(userId, today);
  await cleanOldCandidates(userId, today);

  const skipped: string[] = [];
  const perCategory = await Promise.all(profile.categories.map((category) => categoryUrls(category, profile.locations, today, limits, skipped)));
  const urls = Array.from(new Set(perCategory.flat()));
  const known = await knownUrls(userId, urls);
  const fresh = urls.filter((u) => !known.has(u));

  const analyzed = (
    await mapLimit(fresh, CONCURRENCY, async (url): Promise<Analyzed | null> => {
      const page = await readJobPage(url).catch(() => null);
      if (!page || !page.ok) return null;
      try {
        const extracted = await extractPostingFacts(userId, page.body);
        // 存原来要读的那个标准网址（跟完跳转可能带上追踪参数）
        return extracted.is_posting ? { url: jobDetailUrl(page.url) ?? url, body: page.body, extracted, category: extracted.category } : null;
      } catch {
        return null;
      }
    })
  )
    .filter((x): x is Analyzed => x !== null)
    .filter((x) => locationVerdict(x.extracted.facts.location, x.extracted.facts.remote, profile.locations) !== "drop")
    // 按事实筛：只招新卒的、必须条件要 2 年以上经验的不留（他工作半年）
    .filter((x) => x.extracted.facts.hire_type !== "new" && experienceVerdict(x.extracted.facts.experience?.min_years) !== "too_much")
    // 同一类里中途在前、第二新卒在后（只按招哪种排，不打分）
    .sort((a, b) => hireTypeOrder(a.extracted.facts.hire_type) - hireTypeOrder(b.extracted.facts.hire_type));

  let kept = 0;
  for (const item of pickCandidates(analyzed, profile.categories, limits.cap, limits.perCat)) {
    const saved = await savePosting(userId, item.extracted, { body: item.body, url: item.url, source: "search", picked: false, foundOn: today });
    if (!saved.existed) kept += 1;
  }
  return { read: analyzed.length, kept, skipped };
}

/** 快搜：打开 /jobs 时跑（60 秒内）。 */
export async function runDailyJobSearch(userId: string, today = tokyoDate()): Promise<{ read: number; kept: number; skipped: string[] }> {
  return runSearch(userId, today, QUICK_SEARCH);
}

/** 大搜：他电脑上的填表助手每天跑一次，或者 npm run jobs:search 手动跑。 */
export async function runBigJobSearch(userId: string, today = tokyoDate()): Promise<{ read: number; kept: number; skipped: string[] }> {
  return runSearch(userId, today, BIG_SEARCH);
}
