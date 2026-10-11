import { supabaseAdmin } from "@/lib/supabase";
import { GITHUB_SOURCE } from "./feeds";

/**
 * GitHub 新工具：用公开的搜索接口找最近 7 天新建、星数已经过线的仓库。
 * 不需要 token（未认证每分钟 10 次，一天跑一次绰绰有余）。
 * GitHub 没有官方的 trending 接口，"新建 + 星数排序"是最接近的公开做法。
 */

const LOOKBACK_DAYS = 7;
const MIN_STARS = 50;
const PER_RUN = 40;

type Repo = {
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  created_at: string;
  topics?: string[];
};

/** 仓库 → 一段给人和 AI 都能读的说明。 */
export function describeRepo(repo: Pick<Repo, "description" | "language" | "stargazers_count" | "topics">): string {
  const parts = [
    repo.description?.trim() || "（作者没写简介）",
    repo.language ? `语言：${repo.language}` : "",
    `星数：${repo.stargazers_count}`,
    repo.topics?.length ? `标签：${repo.topics.slice(0, 6).join(", ")}` : "",
  ];
  return parts.filter(Boolean).join(" · ");
}

export async function fetchGithubTools(): Promise<{ inserted: number }> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
  const params = new URLSearchParams({
    q: `created:>${since} stars:>${MIN_STARS}`,
    sort: "stars",
    order: "desc",
    per_page: String(PER_RUN),
  });
  const res = await fetch(`https://api.github.com/search/repositories?${params}`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "ideaos-news/1.0" },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const data = (await res.json()) as { items?: Repo[] };

  const rows = (data.items ?? []).map((repo) => ({
    source: GITHUB_SOURCE,
    source_id: repo.full_name,
    url: repo.html_url,
    title: repo.full_name,
    raw_text: describeRepo(repo).slice(0, 2000),
    published_at: repo.created_at,
  }));
  if (rows.length === 0) return { inserted: 0 };

  const { data: inserted, error } = await supabaseAdmin
    .from("external_signals")
    .upsert(rows, { onConflict: "source,source_id", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(error.message);
  return { inserted: inserted?.length ?? 0 };
}
