import { supabaseAdmin } from "@/lib/supabase";
import { writeMonthlyDigest, type MonthlyWeekInput } from "@/lib/ai";
import { generateWeekly, getWeekly, type Weekly } from "./weekly";
import { listGapBoard } from "./gaps";
import type { GapSide } from "./gaps-shared";
import { tokyoToday } from "./brief";
import {
  lineStatus,
  monthRange,
  monthWeeks,
  weekLabel,
  type Monthly,
  type MonthlyActivity,
  type MonthlyLine,
  type MonthlyRelated,
} from "./monthly-shared";

export * from "./monthly-shared";

/**
 * 月报：这个月过完的那几周的周报连起来看（缺的周报先补写），哪几条线不止一周出现、到月底还在不在走，
 * 再落到差距清单和想法上（标题照抄核对）、每条给一步该做的。存在 signal_briefs 里 kind = monthly 的那一行，
 * brief_date 是那个月的一号（迁移 090 放开了 kind、加了 meta 列）。这个月还没过完时也能写（只算过完的周），可以重写。
 */

const MISSING_MIGRATION = "迁移 090 还没跑：在 Supabase 的 SQL Editor 里执行 supabase/migrations/090_signal_monthly.sql。";
const MAX_GAPS = 30;
const MAX_IDEAS = 20;

export async function getMonthly(userId: string, month: string): Promise<Monthly | null> {
  const { data, error } = await supabaseAdmin
    .from("signal_briefs")
    .select("overview, items, meta, created_at")
    .eq("user_id", userId)
    .eq("brief_date", `${month}-01`)
    .eq("kind", "monthly")
    .maybeSingle();
  if (error) throw new Error(error.message);
  // 正文空着的是「先占个位」的那一行（见 generateMonthly），当没写
  if (!data || !(data.overview as string | null)) return null;
  const meta = (data.meta ?? {}) as { weeks?: string[] };
  const lines = Array.isArray(data.items) ? (data.items as MonthlyLine[]) : [];
  return { month, weeks: meta.weeks ?? [], summary: (data.overview as string) ?? "", lines, created_at: data.created_at as string };
}

/** 生成（或重写）这个月的月报。过完的周有周报的不到两周就返回 null。 */
export async function generateMonthly(userId: string, month: string): Promise<Monthly | null> {
  const today = tokyoToday();
  const weekStarts = monthWeeks(month, today);
  if (weekStarts.length < 2) return null;
  // 先确认迁移 090 跑过（kind 放开了 monthly）再调 AI：没跑的话每次打开页面都白写一遍
  const { data: existing, error: probeError } = await supabaseAdmin
    .from("signal_briefs")
    .select("brief_date")
    .eq("user_id", userId)
    .eq("brief_date", `${month}-01`)
    .eq("kind", "monthly")
    .maybeSingle();
  if (probeError) throw new Error(probeError.message);
  if (!existing) {
    const { error } = await supabaseAdmin
      .from("signal_briefs")
      .upsert({ user_id: userId, brief_date: `${month}-01`, kind: "monthly", overview: "", items: [], meta: { weeks: [] } }, { onConflict: "user_id,brief_date,kind" });
    if (error) {
      if (/kind_check|check constraint|meta/.test(error.message)) throw new Error(MISSING_MIGRATION);
      throw new Error(error.message);
    }
  }
  // 缺的周报先补写（并排写，各十来秒）；写不出来的那周跳过
  const weeklies = await Promise.all(
    weekStarts.map(async (w) => (await getWeekly(userId, w)) ?? (await generateWeekly(userId, w).catch(() => null)))
  );
  const present = weekStarts.map((w, i) => ({ weekStart: w, weekly: weeklies[i] })).filter((x): x is { weekStart: string; weekly: Weekly } => x.weekly !== null);
  if (present.length < 2) return null;

  const threadOf = new Map<string, { weekStart: string; title: string }>();
  const weeks: MonthlyWeekInput[] = present.map(({ weekStart, weekly }, i) => ({
    label: weekLabel(i, weekStart),
    summary: weekly.summary,
    threads: weekly.threads.map((t, j) => {
      const id = `w${i + 1}.t${j + 1}`;
      threadOf.set(id, { weekStart, title: t.title });
      return { id, title: t.title, note: t.note };
    }),
  }));

  // 差距清单（还开着的）和没归档的想法：给它编号，让它挑跟哪条线有关
  const [board, ideas] = await Promise.all([
    listGapBoard(userId, today),
    supabaseAdmin.from("ideas").select("id, title").eq("user_id", userId).neq("status", "归档").order("last_activity_at", { ascending: false }).limit(MAX_IDEAS),
  ]);
  if (ideas.error) throw new Error(ideas.error.message);
  const relatedOf = new Map<string, MonthlyRelated>();
  const gaps = (["japan", "us", "china"] as GapSide[]).flatMap((side) => board.sides[side].open.map((g) => ({ side, id: g.signal_id, title: g.headline })));
  gaps.slice(0, MAX_GAPS).forEach((g, i) => relatedOf.set(`G${i + 1}`, { kind: "gap", id: g.id, side: g.side, title: g.title }));
  ((ideas.data ?? []) as { id: string; title: string | null }[])
    .filter((x) => x.title)
    .forEach((x, i) => relatedOf.set(`I${i + 1}`, { kind: "idea", id: x.id, title: x.title as string }));

  const written = await writeMonthlyDigest(
    weeks,
    Array.from(relatedOf, ([id, r]) => ({ id, title: r.title }))
  );
  const lines: MonthlyLine[] = written.lines.map((l) => {
    const threads = l.threadIds.map((id) => threadOf.get(id)).filter((x): x is { weekStart: string; title: string } => Boolean(x));
    const lineWeeks = Array.from(new Set(threads.map((t) => t.weekStart))).sort();
    return {
      title: l.title,
      note: l.note,
      weeks: lineWeeks,
      status: lineStatus(lineWeeks, present.map((p) => p.weekStart)),
      threads: threads.sort((a, b) => a.weekStart.localeCompare(b.weekStart)),
      related: l.related.map((id) => relatedOf.get(id)).filter((x): x is MonthlyRelated => Boolean(x)),
      next: l.next,
      why: l.why,
    };
  });
  const usedWeeks = present.map((p) => p.weekStart);
  const { error } = await supabaseAdmin
    .from("signal_briefs")
    .upsert(
      // items 和周报一样是数组（别处按数组读 signal_briefs.items），连起来的是哪几周放 meta
      { user_id: userId, brief_date: `${month}-01`, kind: "monthly", overview: written.summary, items: lines, meta: { weeks: usedWeeks } },
      { onConflict: "user_id,brief_date,kind" }
    );
  if (error) {
    if (/kind_check|check constraint|meta/.test(error.message)) throw new Error(MISSING_MIGRATION);
    throw new Error(error.message);
  }
  return { month, weeks: usedWeeks, summary: written.summary, lines, created_at: new Date().toISOString() };
}

/** 这个月往前推了几格：只数次数，代码数，不经 AI。哪张表没有就是 null。 */
export async function monthlyActivity(userId: string, month: string): Promise<MonthlyActivity> {
  const { start, end } = monthRange(month);
  const from = `${start}T00:00:00+09:00`;
  const nextDay = new Date(Date.parse(`${end}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const to = `${nextDay}T00:00:00+09:00`;
  const inRange = (iso: unknown) => typeof iso === "string" && Date.parse(iso) >= Date.parse(from) && Date.parse(iso) < Date.parse(to);
  const count = async (q: PromiseLike<{ count: number | null; error: unknown }>) => {
    const r = await q;
    return r.error ? null : r.count ?? 0;
  };
  const [judgments, doors, signups, conversations, listens, issues, evidence] = await Promise.all([
    count(
      supabaseAdmin.from("predictions").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("source_type", "signal").gte("made_at", from).lt("made_at", to)
    ),
    count(supabaseAdmin.from("signal_fake_doors").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", from).lt("created_at", to)),
    count(supabaseAdmin.from("signal_fake_door_signups").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", from).lt("created_at", to)),
    count(
      supabaseAdmin
        .from("validations")
        .select("id, ideas!inner(user_id)", { count: "exact", head: true })
        .eq("ideas.user_id", userId)
        .gte("contacted_at", from)
        .lt("contacted_at", to)
    ),
    supabaseAdmin
      .from("signal_gap_voices")
      .select("listened:analysis->>created_at")
      .eq("user_id", userId)
      .then((r) => (r.error ? null : ((r.data ?? []) as unknown as { listened: string | null }[]).filter((x) => inRange(x.listened)).length)),
    supabaseAdmin
      .from("signal_issues")
      .select("published")
      .eq("user_id", userId)
      .then((r) =>
        r.error ? null : (r.data ?? []).filter((x) => ((x.published as { at?: string }[] | null) ?? []).some((p) => inRange(p.at))).length
      ),
    supabaseAdmin
      .from("idea_info_gaps")
      .select("evidence")
      .eq("user_id", userId)
      .then((r) => (r.error ? null : (r.data ?? []).reduce((n, x) => n + ((x.evidence as { at?: string }[] | null) ?? []).filter((e) => inRange(e.at)).length, 0))),
  ]);
  return { judgments, listens, doors, signups, issues, conversations, evidence };
}
