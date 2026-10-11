import { supabaseAdmin } from "@/lib/supabase";
import { SIGNAL_KIND_PREFIX, type SignalKind } from "@/lib/domains/signals/feeds";
import { tokyoToday, type BriefItem } from "@/lib/domains/signals/brief";

export type NewsItem = {
  id: string;
  source: string;
  url: string | null;
  title: string | null;
  raw_text: string;
  published_at: string | null;
  fetched_at: string;
};

/** 某个页签下没处理过的条目，按发布时间倒序。迁移 052 没跑时返回 null。 */
export async function listPendingSignals(kind: SignalKind, limit = 60): Promise<NewsItem[] | null> {
  const { data, error } = await supabaseAdmin
    .from("external_signals")
    .select("id, source, url, title, raw_text, published_at, fetched_at")
    .like("source", `${SIGNAL_KIND_PREFIX[kind]}%`)
    .eq("status", "pending")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) {
    if (/published_at/.test(error.message)) return null;
    throw new Error(error.message);
  }
  // 隔天同一篇换了个分类再进来，表里就会有两行；显示时按链接只留一条。
  const seen = new Set<string>();
  return ((data ?? []) as NewsItem[]).filter((item) => {
    if (!item.url) return true;
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

export type SignalPageExtras = {
  /** 迁移 053 没跑时为 false，精选和背景都不显示。 */
  available: boolean;
  context: string;
  brief: BriefItem[] | null;
};

export async function getSignalPageExtras(userId: string, kind: SignalKind): Promise<SignalPageExtras> {
  const [profile, brief] = await Promise.all([
    supabaseAdmin.from("signal_profiles").select("context").eq("user_id", userId).maybeSingle(),
    supabaseAdmin
      .from("signal_briefs")
      .select("items")
      .eq("user_id", userId)
      .eq("kind", kind)
      .eq("brief_date", tokyoToday())
      .maybeSingle(),
  ]);
  const missing = [profile.error, brief.error].find((e) => e && /signal_(profiles|briefs)/.test(e.message));
  if (missing) return { available: false, context: "", brief: null };
  if (profile.error) throw new Error(profile.error.message);
  if (brief.error) throw new Error(brief.error.message);
  return {
    available: true,
    context: (profile.data?.context as string | undefined) ?? "",
    brief: (brief.data?.items as BriefItem[] | undefined) ?? null,
  };
}
