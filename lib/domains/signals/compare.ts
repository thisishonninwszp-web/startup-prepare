import { supabaseAdmin } from "@/lib/supabase";
import { selectAll } from "@/lib/supabase-all";
import { ownerEmail } from "@/lib/members";
import { memberAccounts, ownerUserId } from "./users";
import { displayName, headToHead, scoresByUser, type Answered, type HeadToHead, type PersonScore } from "./compare-shared";

/**
 * 一起练（迁移 098）：主账号和名单上的朋友，打开了「公开我的分数」的几个人互相看预测题、校准练习的成绩。
 * 默认谁都只看得到自己的。只用于对世界事件的预测（原则 1 例外四）。
 */

export const PREFS_MISSING = "迁移 098 还没跑：在 Supabase 的 SQL Editor 里执行 supabase/migrations/098_signal_recall_share.sql。";

function missing(error: { message: string } | null): boolean {
  return !!error && /signal_prefs|does not exist|schema cache/.test(error.message);
}

type MineRow = { user_id: string; question_id: string; probability: number; mode?: string | null };

/** 各人「你」那一方的预测，点「行」同意 AI 的不算（那是 AI 的分）；迁移 099 没跑时没有 mode，老记录全是先判。 */
async function myForecasts(users: string[]): Promise<{ data: MineRow[]; error: { message: string } | null }> {
  const query = (cols: string) => (a: number, b: number) =>
    supabaseAdmin.from("forecasts").select(cols).eq("source", "me").in("user_id", users).order("question_id").range(a, b) as unknown as PromiseLike<{
      data: MineRow[] | null;
      error: { message: string } | null;
    }>;
  let rows = await selectAll<MineRow>(query("user_id, question_id, probability, mode"));
  if (rows.error && /mode/.test(rows.error.message)) rows = await selectAll<MineRow>(query("user_id, question_id, probability"));
  return { data: rows.data.filter((f) => f.mode !== "agree"), error: rows.error };
}

export async function setSharePref(userId: string, share: boolean): Promise<void> {
  const { error } = await supabaseAdmin.from("signal_prefs").upsert({ user_id: userId, share_scores: share, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw new Error(missing(error) ? PREFS_MISSING : error.message);
}

export type CompareBoard = {
  /** 我打开了没有。 */
  sharing: boolean;
  /** 一起用的有几个人（不算我）、其中几个打开了。 */
  others: number;
  othersSharing: number;
  /** 我打开了才有：打开了的每个人（我在第一个）的预测题、校准练习成绩，和我比谁更近。 */
  live: { scores: (PersonScore & { name: string })[]; vs: (HeadToHead & { name: string })[] } | null;
  drill: { scores: (PersonScore & { name: string })[]; vs: (HeadToHead & { name: string })[] } | null;
};

/** 一起用的人（主账号 + 名单上已注册的朋友）。只有我一个返回 null（没什么可比的）。迁移没跑也返回 null。 */
export async function compareBoard(userId: string): Promise<CompareBoard | null> {
  const [owner, members] = await Promise.all([ownerUserId(), memberAccounts().catch(() => [])]);
  const people = new Map<string, string>();
  if (owner) people.set(owner, displayName(ownerEmail()));
  for (const m of members) people.set(m.id, displayName(m.email));
  if (!people.has(userId) || people.size < 2) return null;

  const { data: prefs, error } = await supabaseAdmin.from("signal_prefs").select("user_id, share_scores").in("user_id", Array.from(people.keys()));
  if (error) {
    if (missing(error)) return null;
    throw new Error(error.message);
  }
  const sharing = new Set(((prefs ?? []) as { user_id: string; share_scores: boolean }[]).filter((p) => p.share_scores).map((p) => p.user_id));
  const board: CompareBoard = {
    sharing: sharing.has(userId),
    others: people.size - 1,
    othersSharing: Array.from(sharing).filter((u) => u !== userId).length,
    live: null,
    drill: null,
  };
  if (!board.sharing) return board;
  const users = [userId, ...Array.from(sharing).filter((u) => u !== userId)];
  const named = <T extends { user?: string; other?: string }>(x: T) => ({ ...x, name: people.get((x.user ?? x.other) as string) ?? "" });

  // 线上的预测题：题在主账号那一池，「你」那一方按各自的 user_id
  const [questions, mine, drill] = await Promise.all([
    owner
      ? selectAll<{ id: string; outcome: boolean | null }>((a, b) =>
          supabaseAdmin.from("forecast_questions").select("id, outcome").eq("user_id", owner).eq("status", "resolved").order("id").range(a, b)
        )
      : Promise.resolve({ data: [] as { id: string; outcome: boolean | null }[], error: null }),
    myForecasts(users),
    selectAll((a, b) =>
      supabaseAdmin
        .from("forecast_history_answers")
        .select("user_id, question_id, probability, knew, forecast_history!inner(outcome)")
        .in("user_id", users)
        .order("question_id")
        .range(a, b)
    ),
  ]);
  const outcomes = new Map(questions.data.filter((q) => q.outcome !== null).map((q) => [q.id, q.outcome as boolean]));
  const liveRows: Answered[] = mine.data.flatMap((f) => (outcomes.has(f.question_id) ? [{ user: f.user_id, question: f.question_id, p: Number(f.probability), y: outcomes.get(f.question_id) as boolean }] : []));
  type DrillRow = { user_id: string; question_id: string; probability: number | null; knew: boolean; forecast_history: { outcome: boolean } };
  const drillRows: Answered[] = (drill.data as unknown as DrillRow[]).flatMap((a) =>
    !a.knew && a.probability !== null ? [{ user: a.user_id, question: a.question_id, p: Number(a.probability), y: a.forecast_history.outcome }] : []
  );
  const block = (rows: Answered[]) => ({
    scores: scoresByUser(rows, users).map(named),
    vs: users.slice(1).map((o) => named(headToHead(rows, userId, o))),
  });
  board.live = block(liveRows);
  board.drill = block(drillRows);
  return board;
}
