import { fetchPublicPage } from "@/app/(app)/materials/fetch-page";
import { webSearch } from "@/lib/web-search";
import { extractPostingFacts, type ExtractedPosting } from "@/lib/ai";
import { getJobProfile, markSearched, MISSING_MIGRATION } from "./profile";
import { cleanOldCandidates, knownUrls, readJobPage, savePosting } from "./postings";
import {
  ATS_HOSTS,
  atsJobLinks,
  atsOf,
  careerQuery,
  experienceVerdict,
  hireTypeOrder,
  isAtsDetailUrl,
  JOB_CATEGORIES,
  locationVerdict,
  normalizeUrl,
  pickCandidates,
  pickJobLinks,
  searchQuery,
  tokyoDate,
  type JobCategory,
} from "./shared";

/**
 * 每天搜岗位：每类先搜公司招聘系统（HRMOS、HERP 等，不用登录就能应募，填表助手对付得了）的页面；
 * 搜到的是公司的职位列表页，就顺着里面职位名对得上这一类的链接，读最多 3 个单个岗位。
 * 招聘系统找到的不够 2 个，才再看一般搜索（多半是求人网站的列表页，读了也常常不是单个岗位）。
 * 每类最多读 4 页，抽岗位、按地点和经验要求过滤、四类轮流留最多 8 条候选。
 * 在打开 /jobs 的那个 server action 里跑（60 秒）：7 点的定时任务已经没有余量。
 */

const PAGES_PER_CATEGORY = 4;
const LIST_PAGES_TO_OPEN = 3;
const LINKS_PER_LIST_PAGE = 3;
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

/** 这一类今天要读的几页：招聘系统的单个岗位优先（列表页顺着链接找），不够再用一般搜索补。 */
async function categoryUrls(category: JobCategory, locations: string[], skipped: string[]): Promise<string[]> {
  const career = await webSearch(careerQuery(category, locations), 6, { domains: ATS_HOSTS }).catch(() => null);
  const detail: string[] = [];
  const lists: string[] = [];
  for (const r of career ?? []) {
    const url = normalizeUrl(r.url);
    if (!atsOf(url)) continue;
    (isAtsDetailUrl(url) ? detail : lists).push(url);
  }
  for (const list of lists.slice(0, LIST_PAGES_TO_OPEN)) {
    if (detail.length >= PAGES_PER_CATEGORY) break;
    const page = await fetchPublicPage(list, (html) => html).catch(() => null);
    if (page?.ok) detail.push(...pickJobLinks(atsJobLinks(page.body, page.finalUrl), category, LINKS_PER_LIST_PAGE));
  }
  let urls = Array.from(new Set(detail)).slice(0, PAGES_PER_CATEGORY);
  if (urls.length < 2) {
    const general = await webSearch(searchQuery(category, locations), 5).catch(() => null);
    if (!career && !general) skipped.push(`${JOB_CATEGORIES[category]}：没搜成`);
    urls = Array.from(new Set([...urls, ...(general ?? []).map((r) => normalizeUrl(r.url))])).slice(0, PAGES_PER_CATEGORY);
  }
  return urls;
}

export async function runDailyJobSearch(userId: string, today = tokyoDate()): Promise<{ read: number; kept: number; skipped: string[] }> {
  const profile = await getJobProfile(userId);
  if (profile === "missing-schema") throw new Error(MISSING_MIGRATION);
  if (!profile) throw new Error("先在「条件」里把要找的几类和地点填好。");
  // 先记上今天搜过：两个标签页同时打开不会搜两遍；没搜成的话页面上有"再搜一次"
  await markSearched(userId, today);
  await cleanOldCandidates(userId, today);

  const skipped: string[] = [];
  const perCategory = await Promise.all(profile.categories.map((category) => categoryUrls(category, profile.locations, skipped)));
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
    .filter((x) => locationVerdict(x.extracted.facts.location, x.extracted.facts.remote, profile.locations) !== "drop")
    // 按事实筛：只招新卒的、必须条件要 2 年以上经验的不留（他工作半年）
    .filter((x) => x.extracted.facts.hire_type !== "new" && experienceVerdict(x.extracted.facts.experience?.min_years) !== "too_much")
    // 同一类里中途在前、第二新卒在后（只按招哪种排，不打分）
    .sort((a, b) => hireTypeOrder(a.extracted.facts.hire_type) - hireTypeOrder(b.extracted.facts.hire_type));

  let kept = 0;
  for (const item of pickCandidates(analyzed, profile.categories)) {
    const saved = await savePosting(userId, item.extracted, { body: item.body, url: item.url, source: "search", picked: false, foundOn: today });
    if (!saved.existed) kept += 1;
  }
  return { read: analyzed.length, kept, skipped };
}
