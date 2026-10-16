/**
 * 求职（/jobs）的类型和规则。纯函数，浏览器和服务器都能引。
 * 宪法原则 1：岗位不打分、不算匹配度 —— 这里算的都是"差多少""几家""有几条"，不是分。
 * "市场怎么看我"的数字套用 self 例外的规矩：代码数出来、点开看得到是哪几家、
 * 某类不满 5 家只给次数不给比例、四类之间不合计。
 */

export const JOB_CATEGORIES = {
  data: "数据分析",
  consulting: "咨询",
  planning: "事业企划、经营企划",
  chinese: "需要中文",
} as const;
export type JobCategory = keyof typeof JOB_CATEGORIES;
export type PostingCategory = JobCategory | "none";
export const ALL_CATEGORIES = Object.keys(JOB_CATEGORIES) as JobCategory[];

export function isJobCategory(value: unknown): value is JobCategory {
  return typeof value === "string" && value in JOB_CATEGORIES;
}

export function categoryLabel(category: PostingCategory): string {
  return category === "none" ? "不在你的四类里" : JOB_CATEGORIES[category];
}

export const REMOTE_LEVELS = { full: "全远程", mostly: "基本远程", hybrid: "混合", none: "不远程", unknown: "没写" } as const;
export type RemoteLevel = keyof typeof REMOTE_LEVELS;

export const VISA_FITS = { fits: "对得上", no: "对不上", unclear: "说不清" } as const;
export type VisaFit = keyof typeof VISA_FITS;

/** 招的是哪种人：他工作半年，第二新卒的话等于白丢一年涨薪，所以中途优先、新卒筛掉。 */
export const HIRE_TYPES = { mid: "中途", second_new: "第二新卒枠", new: "只招新卒", unclear: "没写招哪种" } as const;
export type HireType = keyof typeof HIRE_TYPES;

/** 同一类里的先后：中途在前，说不清的其次，第二新卒最后（新卒已经筛掉）。按这一个事实排，不打分。 */
export function hireTypeOrder(type: HireType | undefined): number {
  return type === "mid" ? 0 : type === "second_new" ? 2 : type === "new" ? 3 : 1;
}

export type ExperienceVerdict = "fits" | "stretch" | "too_much" | "unknown";
export const EXPERIENCE_LABELS: Record<ExperienceVerdict, string> = {
  fits: "未経験・経験不問",
  stretch: "要 1 年经验（你半年）",
  too_much: "要 2 年以上经验",
  unknown: "经验要求没写",
};

/** 必须条件里写的最少经验年数：0 = 不问、1 = 勉强够得着、2 年以上筛掉（他 2026-04 入职，半年）。 */
export function experienceVerdict(minYears: number | null | undefined): ExperienceVerdict {
  if (minYears === null || minYears === undefined) return "unknown";
  if (minYears <= 0) return "fits";
  if (minYears <= 1) return "stretch";
  return "too_much";
}

export const APPLICATION_STATUSES = {
  applied: "投了",
  replied: "回了",
  interview: "约面试",
  rejected: "不录用",
  withdrawn: "你撤了",
} as const;
export type ApplicationStatus = keyof typeof APPLICATION_STATUSES;
export type EffectiveStatus = ApplicationStatus | "no_reply";
export const EFFECTIVE_LABELS: Record<EffectiveStatus, string> = { ...APPLICATION_STATUSES, no_reply: "没回音" };

export function isApplicationStatus(value: unknown): value is ApplicationStatus {
  return typeof value === "string" && value in APPLICATION_STATUSES;
}

export const CHANNELS = { site: "公司官网", board: "求人网站", agent: "中介", email: "邮件" } as const;
export type Channel = keyof typeof CHANNELS;

export function isChannel(value: unknown): value is Channel {
  return typeof value === "string" && value in CHANNELS;
}

export const CAREER_TOPICS = {
  education: "学历",
  work: "工作",
  project: "自己发起的项目",
  language: "语言",
  license: "资格",
} as const;
export type CareerTopic = keyof typeof CAREER_TOPICS;
export const CAREER_TOPIC_KEYS = Object.keys(CAREER_TOPICS) as CareerTopic[];

export function isCareerTopic(value: unknown): value is CareerTopic {
  return typeof value === "string" && value in CAREER_TOPICS;
}

/** 底稿访谈：每个话题先问的几句。问的是一件具体的事，不问"你怎么看"。 */
export const BASE_QUESTIONS: Record<CareerTopic, string[]> = {
  education: ["你是哪个学校、哪个专业，哪一年毕业的？", "大学里你最下功夫的一门课或者一件事是什么？最后做出了什么？"],
  work: [
    "Focus 这份工作，上个月你花时间最多的一件事是什么？",
    "你最近一次向老板提建议，提的是什么？拿什么数据说的？后来怎样了？",
    "这份工作里，有没有一件事是你不做就没人做的？",
  ],
  project: ["你自己发起的项目里挑一个：它要解决什么问题，你做了哪几步？", "做出来以后谁用了？用的人说了什么？"],
  language: ["中文、日语、英语各到什么程度？考过的证书和分数也写上（比如 JLPT N1、TOEIC 800）。"],
  license: ["有什么资格或证书？哪一年拿到的？"],
};

export const RESUME_SECTIONS = {
  summary: "職務要約",
  history: "職務経歴",
  skills: "活かせる経験・知識・スキル",
  pr: "自己PR",
  motivation: "志望動機",
} as const;
export type ResumeSectionKey = keyof typeof RESUME_SECTIONS;
export const RESUME_SECTION_KEYS = Object.keys(RESUME_SECTIONS) as ResumeSectionKey[];

/** 投出去多少天状态都没变，算没回音。 */
export const NO_REPLY_DAYS = 21;
/** 某一类投满几家才显示比例。 */
export const RATIO_MIN_APPLICATIONS = 5;
/** 每天最多留几条搜到的候选、每类最多几条。 */
export const DAILY_CANDIDATE_CAP = 8;
export const PER_CATEGORY_CAP = 2;
/** 没点"要这个"的候选留几天。 */
export const CANDIDATE_TTL_DAYS = 14;

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export type PersonalInfo = {
  name: string;
  kana: string;
  birth: string;
  email: string;
  phone: string;
  postal: string;
  address: string;
  /** 最終学歴（学校名、学部）。 */
  school: string;
  /** 现在（或最近）的勤务先。 */
  employer: string;
  /** 应募表单上「希望年収」那一格原样写什么，比如「500万円以上」。 */
  salary_want: string;
  /** 「入社可能時期」，比如「内定後2ヶ月」。 */
  available_from: string;
  visa_expiry: string;
};
export const EMPTY_PERSONAL: PersonalInfo = {
  name: "",
  kana: "",
  birth: "",
  email: "",
  phone: "",
  postal: "",
  address: "",
  school: "",
  employer: "",
  salary_want: "",
  available_from: "",
  visa_expiry: "",
};
export const PERSONAL_FIELDS: [keyof PersonalInfo, string][] = [
  ["name", "氏名"],
  ["kana", "ふりがな"],
  ["birth", "生年月日"],
  ["email", "メールアドレス"],
  ["phone", "電話番号"],
  ["postal", "郵便番号"],
  ["address", "住所"],
  ["school", "最終学歴（学校名・学部）"],
  ["employer", "現在の勤務先（会社名）"],
  ["salary_want", "希望年収（表单上原样写的那句，比如「500万円以上」）"],
  ["available_from", "入社可能時期（比如「内定後2ヶ月」）"],
  ["visa_expiry", "在留期限"],
];

export type JobProfile = {
  categories: JobCategory[];
  locations: string[];
  /** 万日元。 */
  salaryNow: number | null;
  salaryFloor: number | null;
  visa: "gijinkoku" | "none";
  /** 永远不发给 AI。 */
  personal: PersonalInfo;
  lastSearchOn: string | null;
};

export type CareerEntry = {
  id: string;
  topic: CareerTopic;
  org: string;
  period: string;
  raw_text: string;
  draft_ja: string | null;
  confirmed_at: string | null;
  created_at: string;
};

export type PostingCondition = { text: string; quote: string; required: boolean };
export type PostingTerm = { label: string; quote: string };
export type PostingVisa = { fit: VisaFit; quote: string; reason: string };
export type PostingFacts = {
  location: string;
  remote: RemoteLevel;
  salary_min: number | null;
  salary_max: number | null;
  salary_quote: string;
  conditions: PostingCondition[];
  terms: PostingTerm[];
  visa: PostingVisa;
  /** 2026-10-16 加的两样；之前存的岗位没有，读的时候当"没写"。 */
  hire_type?: HireType;
  experience?: { min_years: number | null; quote: string };
};
/** entry_ids[i] 是第 i 条条件对得上的底稿 id（空 = 底稿里没有）；blocker.index 从 1 数，0 = 没指明哪条。 */
export type PostingMatch = { entry_ids: string[][]; blocker: { index: number; text: string } };
export type PostingSource = "share" | "search" | "manual" | "email";

export type JobPosting = {
  id: string;
  company_id: string | null;
  company_name: string;
  title: string;
  url: string | null;
  source: PostingSource;
  material_id: string | null;
  body: string;
  facts: PostingFacts;
  category: PostingCategory;
  match: PostingMatch | null;
  picked_at: string | null;
  found_on: string;
  created_at: string;
};

export type SourcedSentence = { text: string; entry_ids: string[] };
export type DroppedSentence = { text: string; reason: string };
export type ResumeSection = { sentences: SourcedSentence[]; user_text?: string };
export type ResumeProbe = { sentence: string; question: string };
export type TailoredResume = {
  sections: Record<ResumeSectionKey, ResumeSection>;
  probes: ResumeProbe[];
  dropped: (DroppedSentence & { section: ResumeSectionKey })[];
};
export type JobResume = TailoredResume & { id: string; posting_id: string; version: number; created_at: string };

export type ApplicationEvent = { status: ApplicationStatus; on: string };
export type JobApplication = {
  id: string;
  posting_id: string;
  resume_id: string | null;
  channel: Channel;
  status: ApplicationStatus;
  events: ApplicationEvent[];
  offered_salary: number | null;
  applied_on: string;
};

// ---------------------------------------------------------------------------
// 日期
// ---------------------------------------------------------------------------

/** 日本时间的今天（YYYY-MM-DD）。 */
export function tokyoDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(now);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// 年收、地点
// ---------------------------------------------------------------------------

/** 年收（万日元）跟现在比差多少。只说差额，不说值不值。 */
export function salaryDiff(now: number | null, min: number | null, max: number | null): string | null {
  if (now === null) return null;
  const known = [min, max].filter((n): n is number => n !== null);
  if (known.length === 0) return null;
  const lo = Math.min(...known);
  const hi = Math.max(...known);
  const span = (a: number, b: number) => (a === b ? `${a}` : `${a}–${b}`);
  if (lo === now && hi === now) return "跟现在一样";
  if (lo >= now) return `比现在多 ${span(lo - now, hi - now)} 万`;
  if (hi <= now) return `比现在少 ${span(now - hi, now - lo)} 万`;
  return `比现在少 ${now - lo} 万到多 ${hi - now} 万`;
}

/** 年收上限都够不着期望下限（软条件：只标出来，不丢）。 */
export function belowFloor(floor: number | null, min: number | null, max: number | null): boolean {
  if (floor === null) return false;
  const top = max ?? min;
  return top !== null && top < floor;
}

export type LocationVerdict = "keep" | "drop" | "unclear";

/** 全远程、基本远程不管在哪都留；勤务地含你写的地方的留；抽不清的保留并标"地点说不清"。 */
export function locationVerdict(location: string, remote: RemoteLevel, places: string[]): LocationVerdict {
  if (remote === "full" || remote === "mostly") return "keep";
  const loc = location.trim();
  if (loc && places.some((p) => p.trim() && loc.includes(p.trim()))) return "keep";
  if (remote === "unknown" || !loc) return "unclear";
  return "drop";
}

// ---------------------------------------------------------------------------
// 去重、搜索、轮流
// ---------------------------------------------------------------------------

const COMPANY_NOISE = /株式会社|有限会社|合同会社|\(株\)/g;
const PUNCT = /[\s【】[\]()「」『』・,、.。:：/|~〜!?-]/g;

function squashName(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(COMPANY_NOISE, "").replace(PUNCT, "");
}

/** 同一家公司 + 同一个职位名，算同一个岗位。 */
export function postingKey(company: string, title: string): string {
  return `${squashName(company)}|${squashName(title)}`;
}

/** 去掉 #、utm_ 之类的跟踪参数和路径结尾的 /，同一页面的不同写法算一个。 */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = "";
    for (const key of Array.from(u.searchParams.keys())) {
      if (/^(utm_|fbclid|gclid)/i.test(key)) u.searchParams.delete(key);
    }
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) u.pathname = u.pathname.slice(0, -1);
    return u.toString();
  } catch {
    return url.trim();
  }
}

// 找中途、经验要求低的（他工作半年；第二新卒的岗位不专门去找）
const CATEGORY_QUERIES: Record<JobCategory, string> = {
  data: "データアナリスト 中途採用 未経験可 求人",
  consulting: "コンサルタント 中途採用 未経験可 求人",
  planning: "事業企画 経営企画 中途採用 未経験可 求人",
  chinese: "中国語 活かせる 中途採用 未経験可 求人",
};

/** 每类一个搜索词；地点之外总带上フルリモート（全远程不管在哪都要）。 */
export function searchQuery(category: JobCategory, locations: string[]): string {
  const places = [...locations.map((l) => l.trim()).filter(Boolean), "フルリモート"];
  return `${CATEGORY_QUERIES[category]} ${places.join(" OR ")}`;
}

/** 公司自己的招聘系统：这些页面不用登录就能应募，填表助手专门对付它们。 */
export const ATS_SITES = {
  hrmos: { label: "HRMOS", host: "hrmos.co" },
  herp: { label: "HERP", host: "herp.careers" },
  talentio: { label: "Talentio", host: "open.talentio.com" },
  greenhouse: { label: "Greenhouse", host: "greenhouse.io" },
  lever: { label: "Lever", host: "jobs.lever.co" },
} as const;
export type AtsKey = keyof typeof ATS_SITES;

/** 这个网址是不是公司招聘系统的页面（按域名认，子域名也算）。 */
export function atsOf(url: string | null): AtsKey | null {
  if (!url) return null;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  for (const [key, site] of Object.entries(ATS_SITES) as [AtsKey, (typeof ATS_SITES)[AtsKey]][]) {
    if (host === site.host || host.endsWith(`.${site.host}`)) return key;
  }
  return null;
}

/** 招聘系统的域名（搜索时只要这几个网站的页面）。 */
export const ATS_HOSTS: string[] = Object.values(ATS_SITES).map((s) => s.host);

const CAREER_KEYWORDS: Record<JobCategory, string> = {
  data: "データアナリスト",
  consulting: "コンサルタント",
  planning: "事業企画 経営企画",
  chinese: "中国語",
};

/** 搜招聘系统页面用的搜索词：职位关键词和地点（加リモート）。网站范围由 webSearch 的 domains 限定。 */
export function careerQuery(category: JobCategory, locations: string[]): string {
  const places = [...locations.map((l) => l.trim()).filter(Boolean), "リモート"];
  return `${CAREER_KEYWORDS[category]} 中途 未経験歓迎 求人 ${places.join(" ")}`;
}

/** 四类轮流取：每类最多 perCat 条，一共最多 cap 条。不在你选的几类里的不取。 */
export function pickCandidates<T extends { category: PostingCategory }>(
  items: T[],
  categories: JobCategory[],
  cap = DAILY_CANDIDATE_CAP,
  perCat = PER_CATEGORY_CAP
): T[] {
  const queues = categories.map((c) => items.filter((i) => i.category === c));
  const picked: T[] = [];
  for (let round = 0; round < perCat; round++) {
    for (const queue of queues) {
      if (picked.length >= cap) return picked;
      const next = queue[round];
      if (next) picked.push(next);
    }
  }
  return picked;
}

// ---------------------------------------------------------------------------
// 投递与计数
// ---------------------------------------------------------------------------

/** "没回音"不由人点：状态还是"投了"，而且最后一次变化已经过了 21 天。 */
export function effectiveStatus(
  app: { status: ApplicationStatus; events: ApplicationEvent[]; applied_on: string },
  today: string
): EffectiveStatus {
  if (app.status !== "applied") return app.status;
  const last = app.events.length > 0 ? app.events[app.events.length - 1].on : app.applied_on;
  return daysBetween(last, today) >= NO_REPLY_DAYS ? "no_reply" : "applied";
}

export type MarketApp = {
  posting_id: string;
  company_name: string;
  title: string;
  category: PostingCategory;
  status: ApplicationStatus;
  events: ApplicationEvent[];
  applied_on: string;
  offered_salary: number | null;
};

export type MarketRow = {
  category: JobCategory;
  applied: number;
  replied: number;
  interview: number;
  rejected: number;
  noReply: number;
  /** 投满 RATIO_MIN_APPLICATIONS 家才有（百分比整数）；分母是这一类投了几家。 */
  replyRate: number | null;
  salaries: number[];
  salaryRange: [number, number] | null;
  apps: (MarketApp & { effective: EffectiveStatus })[];
};

function everReached(app: MarketApp, statuses: ApplicationStatus[]): boolean {
  return statuses.includes(app.status) || app.events.some((e) => statuses.includes(e.status));
}

/** 四类各一行，只数次数；投满 5 家才给"回了"的比例。四类之间不合计。"回了"包括后来约了面试的。 */
export function marketRows(apps: MarketApp[], categories: JobCategory[], today: string): MarketRow[] {
  return categories.map((category) => {
    const mine = apps.filter((a) => a.category === category).map((a) => ({ ...a, effective: effectiveStatus(a, today) }));
    const replied = mine.filter((a) => everReached(a, ["replied", "interview"])).length;
    const salaries = mine.map((a) => a.offered_salary).filter((s): s is number => typeof s === "number");
    return {
      category,
      applied: mine.length,
      replied,
      interview: mine.filter((a) => everReached(a, ["interview"])).length,
      rejected: mine.filter((a) => a.status === "rejected").length,
      noReply: mine.filter((a) => a.effective === "no_reply").length,
      replyRate: mine.length >= RATIO_MIN_APPLICATIONS ? Math.round((replied / mine.length) * 100) : null,
      salaries,
      salaryRange: salaries.length >= 2 ? [Math.min(...salaries), Math.max(...salaries)] : null,
      apps: mine,
    };
  });
}

// ---------------------------------------------------------------------------
// 对照、简历
// ---------------------------------------------------------------------------

/** 必须条件和加分条件各有几条对得上、几条缺。 */
export function matchCounts(
  conditions: PostingCondition[],
  match: PostingMatch
): { required: { have: number; missing: number }; bonus: { have: number; missing: number } } {
  const out = { required: { have: 0, missing: 0 }, bonus: { have: 0, missing: 0 } };
  conditions.forEach((c, i) => {
    const bucket = c.required ? out.required : out.bonus;
    if ((match.entry_ids[i] ?? []).length > 0) bucket.have += 1;
    else bucket.missing += 1;
  });
  return out;
}

/** 一段简历的文字：他改过的用他写的；技能和经历一句一行，其余连成一段。 */
export function sectionText(key: ResumeSectionKey, section: ResumeSection | undefined): string {
  if (!section) return "";
  if (typeof section.user_text === "string") return section.user_text;
  const sep = key === "skills" || key === "history" ? "\n" : "";
  return section.sentences.map((s) => s.text).join(sep);
}

// ---------------------------------------------------------------------------
// 条件表单
// ---------------------------------------------------------------------------

type FormLike = { get(name: string): unknown; getAll(name: string): unknown[] };

function salaryField(value: unknown): number | null | "bad" {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return null;
  const n = Number(text);
  return Number.isInteger(n) && n >= 100 && n <= 5000 ? n : "bad";
}

/** 条件页的表单 → 要存的条件；不对时返回一句给人看的话。 */
export function parseProfileForm(form: FormLike): Omit<JobProfile, "lastSearchOn"> | string {
  const categories = form.getAll("categories").filter(isJobCategory);
  if (categories.length === 0) return "至少选一类岗位";
  const locations = String(form.get("locations") ?? "")
    .split(/[、,，\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 5);
  const salaryNow = salaryField(form.get("salary_now"));
  const salaryFloor = salaryField(form.get("salary_floor"));
  if (salaryNow === "bad" || salaryFloor === "bad") return "年收写万日元的整数，比如 500";
  const personal = Object.fromEntries(
    PERSONAL_FIELDS.map(([key]) => [key, String(form.get(key) ?? "").trim().slice(0, 200)])
  ) as PersonalInfo;
  return {
    categories: Array.from(new Set(categories)),
    locations,
    salaryNow,
    salaryFloor,
    visa: form.get("visa") === "none" ? "none" : "gijinkoku",
    personal,
  };
}
