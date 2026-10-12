import { supabaseAdmin } from "@/lib/supabase";
import { writeDailyDigest, type DigestSectionInput } from "@/lib/ai";
import type { BriefItem } from "./brief";

/**
 * 今日总览：看完五节以后，像一个懂行的人跟他讲几句今天世界上发生了什么，再挑最值得点开的三条。
 * 存在 signal_briefs 里 kind = digest 的那一行：overview 是总览正文，items 是挑出来的几条。
 * 7 点的定时任务有余量时顺手生成；没生成的话，第一次打开报告页时生成。
 */

export type DigestPick = { signal_id: string; headline: string; why: string };
/** 可以往下推的一条（AI 推测的因果链，没检验过）。 */
export type DigestChain = { signal_id: string; headline: string; steps: string[] };
export type Digest = { summary: string; picks: DigestPick[]; chain?: DigestChain };

const SECTION_TITLES: Record<string, string> = {
  news: "今天的世界",
  calendar: "已经定了的未来",
  voices: "谁在头疼什么",
  money: "谁在掏钱",
  tools: "新工具和新可能",
};

/** 迁移 061 没跑时返回 "missing-schema"。 */
export async function getDigest(userId: string, date: string): Promise<Digest | null | "missing-schema"> {
  const { data, error } = await supabaseAdmin
    .from("signal_briefs")
    .select("overview, items, practice")
    .eq("user_id", userId)
    .eq("brief_date", date)
    .eq("kind", "digest")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  // 总览那一行没有练习题，practice 这一列拿来存"可以往下推的一条"，省一次迁移
  const chain = (data.practice as DigestChain | null) ?? undefined;
  return { summary: (data.overview as string) ?? "", picks: (data.items as DigestPick[] | null) ?? [], chain };
}

/** 生成（或重新生成）这一天的总览。那天一节报告都没有就返回 null。 */
export async function generateDigest(userId: string, date: string): Promise<Digest | null> {
  const { data, error } = await supabaseAdmin
    .from("signal_briefs")
    .select("kind, overview, items")
    .eq("user_id", userId)
    .eq("brief_date", date)
    .neq("kind", "digest");
  if (error) throw new Error(error.message);
  const order = ["news", "calendar", "voices", "money", "tools"];
  const rows = (data ?? []).sort((a, b) => order.indexOf(a.kind as string) - order.indexOf(b.kind as string));
  const headlineOf = new Map<string, string>();
  const sections: DigestSectionInput[] = rows.map((r) => {
    const items = ((r.items as BriefItem[] | null) ?? []).filter((i) => !i.extra);
    for (const i of items) headlineOf.set(i.signal_id, i.headline);
    return {
      title: SECTION_TITLES[r.kind as string] ?? (r.kind as string),
      overview: (r.overview as string | null) ?? "",
      items: items.map((i) => ({ signalId: i.signal_id, headline: i.headline, surprise: !!i.surprise })),
    };
  });
  if (sections.every((s) => s.items.length === 0)) return null;

  const written = await writeDailyDigest(sections);
  const digest: Digest = {
    summary: written.summary,
    picks: written.picks.map((p) => ({ signal_id: p.signalId, headline: headlineOf.get(p.signalId) ?? "", why: p.why })),
    chain: written.chain
      ? { signal_id: written.chain.signalId, headline: headlineOf.get(written.chain.signalId) ?? "", steps: written.chain.steps }
      : undefined,
  };
  const { error: saveError } = await supabaseAdmin
    .from("signal_briefs")
    .upsert(
      { user_id: userId, brief_date: date, kind: "digest", overview: digest.summary, items: digest.picks, practice: digest.chain ?? null },
      { onConflict: "user_id,brief_date,kind" }
    );
  if (saveError) {
    if (/kind_check|check constraint/.test(saveError.message)) throw new Error("迁移 061 还没跑");
    throw new Error(saveError.message);
  }
  return digest;
}
