import { supabaseAdmin } from "@/lib/supabase";
import { writeDailyDigest, writeDigestDetail, type DetailTheme, type DigestSectionInput } from "@/lib/ai";
import type { BriefItem } from "./brief";
import { REPORT_SECTION_KINDS } from "./feeds";
import { KIND_TITLES } from "./memory-shared";

/**
 * 今日总览：看完五节以后，像一个懂行的人跟他讲几句今天世界上发生了什么，再挑最值得点开的三条。
 * 存在 signal_briefs 里 kind = digest 的那一行：overview 是总览正文，items 是挑出来的几条。
 * 6 点的定时任务有余量时顺手生成；没生成的话，第一次打开报告页时生成。
 */

export type DigestPick = { signal_id: string; headline: string; why: string };
/** 可以往下推的一条（AI 推测的因果链，没检验过）。 */
export type DigestChain = { signal_id: string; headline: string; steps: string[] };
/** 详细报告：今天最重要的几件事一件件讲透。点了才写（二三十秒），写过就存着。 */
export type DigestDetailStored = { themes: (DetailTheme & { headlines: string[] })[] };
export type Digest = { summary: string; picks: DigestPick[]; chain?: DigestChain; detail?: DigestDetailStored };

/**
 * practice 这一列：最早只存"可以往下推的一条"（有 steps），后来改成 { chain, detail }。两种都认。
 */
type PracticeColumn = DigestChain | { chain?: DigestChain; detail?: DigestDetailStored } | null;

function readPracticeColumn(raw: PracticeColumn): { chain?: DigestChain; detail?: DigestDetailStored } {
  if (!raw) return {};
  if ("steps" in raw) return { chain: raw };
  return { chain: raw.chain ?? undefined, detail: raw.detail ?? undefined };
}

const SECTION_TITLES: Record<string, string> = KIND_TITLES;

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
  // 总览那一行没有练习题，practice 这一列拿来存"可以往下推的一条"和详细报告，省一次迁移
  const { chain, detail } = readPracticeColumn(data.practice as PracticeColumn);
  return { summary: (data.overview as string) ?? "", picks: (data.items as DigestPick[] | null) ?? [], chain, detail };
}

/** 生成（或重新生成）这一天的总览。那天一节报告都没有就返回 null。 */
export async function generateDigest(userId: string, date: string): Promise<Digest | null> {
  const { data, error } = await supabaseAdmin
    .from("signal_briefs")
    .select("kind, overview, items")
    .eq("user_id", userId)
    .eq("brief_date", date)
    .in("kind", REPORT_SECTION_KINDS);
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
      // 重写总览时详细报告也作废（下面几节可能也重写过了），要看再点一次
      { user_id: userId, brief_date: date, kind: "digest", overview: digest.summary, items: digest.picks, practice: { chain: digest.chain ?? null } },
      { onConflict: "user_id,brief_date,kind" }
    );
  if (saveError) {
    if (/kind_check|check constraint/.test(saveError.message)) throw new Error("迁移 061 还没跑");
    throw new Error(saveError.message);
  }
  return digest;
}

/** 写这一天的详细报告，存进总览那一行（不动总览和往下推的那一条）。总览还没写就先报错。 */
export async function generateDigestDetail(userId: string, date: string): Promise<DigestDetailStored> {
  const { data: rows, error } = await supabaseAdmin
    .from("signal_briefs")
    .select("kind, items, practice")
    .eq("user_id", userId)
    .eq("brief_date", date);
  if (error) throw new Error(error.message);
  const digestRow = (rows ?? []).find((r) => r.kind === "digest");
  if (!digestRow) throw new Error("总览还没写，先等总览出来");
  const order = ["news", "calendar", "voices", "money", "tools"];
  const headlineOf = new Map<string, string>();
  const items = (rows ?? [])
    .filter((r) => order.includes(r.kind as string))
    .sort((a, b) => order.indexOf(a.kind as string) - order.indexOf(b.kind as string))
    .flatMap((r) =>
      ((r.items as BriefItem[] | null) ?? [])
        .filter((i) => !i.extra)
        .map((i) => {
          headlineOf.set(i.signal_id, i.headline);
          return {
            signalId: i.signal_id,
            section: SECTION_TITLES[r.kind as string] ?? (r.kind as string),
            headline: i.headline,
            background: i.background ?? "",
            quotes: i.basis ?? [],
            precedent: i.precedent,
          };
        })
    );
  const written = await writeDigestDetail(items);
  const detail: DigestDetailStored = {
    themes: written.themes.map((t) => ({ ...t, headlines: t.signalIds.map((id) => headlineOf.get(id) ?? "") })),
  };
  const { chain } = readPracticeColumn(digestRow.practice as PracticeColumn);
  const { error: saveError } = await supabaseAdmin
    .from("signal_briefs")
    .update({ practice: { chain: chain ?? null, detail } })
    .eq("user_id", userId)
    .eq("brief_date", date)
    .eq("kind", "digest");
  if (saveError) throw new Error(saveError.message);
  return detail;
}
