import { asksByYear, readTotals, type ChiebukuroSample, type KokkaiYears, type RedditSample, type YoutubeYears } from "./asks-shared";
import type { CfSample, GcSample, PrSample } from "./sites-shared";

/**
 * 「补进这个缺口」用的一句话：每一样自动数出来的东西，由代码拼成一句（只有数和原标题，不经 AI），连同链接存进想法的信息缺口。
 * 这样标「拿到了 / 拿不到」、做 Go / Kill 时，证据就在缺口下面。浏览器端也要用，不碰网络。
 */

export type AsksSummaryKey = "chiebukuro" | "girlschannel" | "reddit" | "asked" | "campfire" | "prtimes" | "youtube" | "kokkai";
export type AsksSummary = { key: AsksSummaryKey; title: string; url: string | null };

export type AsksSummaryInput = {
  topic: string;
  chiebukuro?: ChiebukuroSample | null;
  girlschannel?: GcSample | null;
  campfire?: CfSample | null;
  prtimes?: PrSample | null;
  asked?: string[] | null;
  kokkai?: KokkaiYears | null;
  youtubeYears?: YoutubeYears | "no-key" | null;
  reddit?: RedditSample | "no-key" | null;
  /** 哪天量的（YYYY-MM-DD），写进句子里。 */
  date: string;
};

const MAX = 300;

/** 量的那一刻（ISO）→ 日本的日子。 */
export function tokyoDate(iso: string): string {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t + 9 * 3_600_000).toISOString().slice(0, 10) : iso.slice(0, 10);
}
const n = (v: number) => v.toLocaleString("ja-JP");
const q = (s: string) => encodeURIComponent(s);

function clip(s: string): string {
  return s.length > MAX ? `${s.slice(0, MAX - 1)}…` : s;
}

/** 有数的年份范围（「2018–2026 年」）；只有一年就写那一年。 */
function span(years: { year: number; count: number }[]): string {
  const had = years.filter((y) => y.count > 0).map((y) => y.year);
  if (had.length === 0) return "";
  const lo = Math.min(...had);
  const hi = Math.max(...had);
  return lo === hi ? `${lo} 年` : `${lo}–${hi} 年`;
}

/** 每年几个，写成「2024 年 3、2025 年 5」（只写最近五个有数的年份）。 */
function perYear(years: { year: number; count: number }[], unit: string): string {
  return years
    .slice(-5)
    .map((y) => `${y.year} 年 ${y.count}${unit}`)
    .join("、");
}

/** 取到了的那几样各一句（没取到、空着的不出）。 */
export function asksSummaries(a: AsksSummaryInput): AsksSummary[] {
  const t = a.topic;
  const thisYear = Number(a.date.slice(0, 4));
  const tag = `（${a.date} 程序自动数的）`;
  const out: AsksSummary[] = [];

  if (a.chiebukuro && a.chiebukuro.asks.length > 0) {
    const years = asksByYear(a.chiebukuro.asks, thisYear);
    const tot = readTotals(a.chiebukuro.asks);
    out.push({
      key: "chiebukuro",
      title: clip(
        `知恵袋：Google 找到的提问页连同相关提问，标题里有「${t}」的 ${a.chiebukuro.asks.length} 个（${span(years)}；${perYear(years, " 个")}）` +
          (tot.pages > 0 ? `；读过的 ${tot.pages} 页一共被看了 ${n(tot.views)} 次、${n(tot.sympathy)} 人点了共感` : "") +
          tag
      ),
      url: `https://chiebukuro.yahoo.co.jp/search?p=${q(t)}`,
    });
  }

  if (a.girlschannel && a.girlschannel.topics.length > 0) {
    const g = a.girlschannel;
    const years = asksByYear(g.topics, thisYear);
    const comments = g.topics.reduce((s, x) => s + x.comments, 0);
    const top = [...g.topics].sort((x, y) => y.comments - x.comments)[0];
    out.push({
      key: "girlschannel",
      title: clip(
        `ガルちゃん：标题里有「${t}」的讨论 ${g.topics.length} 个、一共 ${n(comments)} 条评论（${span(years)}；${perYear(years, " 个")}）；评论最多的「${top.title}」${n(top.comments)} 条${tag}`
      ),
      url: `https://girlschannel.net/topics/search/?q=${q(t)}`,
    });
  }

  if (a.reddit && a.reddit !== "no-key" && a.reddit.posts.length > 0) {
    const r = a.reddit;
    const years = asksByYear(r.posts, thisYear);
    out.push({
      key: "reddit",
      title: clip(`Reddit 在日外国人版块：翻了 ${r.searched} 条，标题或正文里有「${r.term}」的 ${r.posts.length} 条（${perYear(years, " 条")}）${tag}`),
      url: `https://www.reddit.com/r/japanlife/search/?q=${q(r.term)}&restrict_sr=1`,
    });
  }

  if (a.asked && a.asked.length > 0) {
    out.push({
      key: "asked",
      title: clip(`Google 联想里，人们在「${t}」后面还会搜：${a.asked.slice(0, 15).map((s) => `「${s}」`).join("")}${tag}`),
      url: null,
    });
  }

  if (a.campfire && a.campfire.projects.length > 0) {
    const c = a.campfire;
    const raised = c.projects.reduce((s, p) => s + p.amount, 0);
    const backers = c.projects.reduce((s, p) => s + p.backers, 0);
    const top = [...c.projects].sort((x, y) => y.amount - x.amount)[0];
    out.push({
      key: "campfire",
      title: clip(
        `CAMPFIRE：标题里有「${t}」的众筹 ${c.projects.length} 个，一共筹到 ${n(raised)} 日元、${n(backers)} 人支持；最多的一个 ${n(top.amount)} 日元、${n(top.backers)} 人（「${top.title}」）${tag}`
      ),
      url: `https://camp-fire.jp/projects/search?word=${q(t)}`,
    });
  }

  if (a.prtimes && a.prtimes.releases.length > 0) {
    const p = a.prtimes;
    const companies = Array.from(new Set(p.releases.map((r) => r.company).filter(Boolean)));
    out.push({
      key: "prtimes",
      title: clip(`PR TIMES：最新 ${p.seen} 篇里标题有「${t}」的 ${p.releases.length} 篇，来自 ${companies.slice(0, 6).join("、")}${tag}`),
      url: `https://prtimes.jp/main/action.php?run=html&page=searchkey&search_word=${q(t)}`,
    });
  }

  if (a.youtubeYears && a.youtubeYears !== "no-key" && a.youtubeYears.length > 0) {
    const ys = a.youtubeYears;
    out.push({
      key: "youtube",
      title: clip(
        `YouTube：标题里有「${t}」的新视频，${ys.map((y) => `${y.year} 年 ${y.count}${y.capped ? "+" : ""} 条`).join("、")}（每年只看前 50 条，带 + 的实际更多）${tag}`
      ),
      url: `https://www.youtube.com/results?search_query=${q(t)}`,
    });
  }

  if (a.kokkai && a.kokkai.length > 0) {
    out.push({
      key: "kokkai",
      title: clip(`国会：提到「${t}」的发言，${perYear(a.kokkai, " 次")}${tag}`),
      url: `https://kokkai.ndl.go.jp/#/result?keyword=${q(t)}`,
    });
  }

  return out;
}
