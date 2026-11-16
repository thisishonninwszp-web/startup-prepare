import { supabaseAdmin } from "@/lib/supabase";
import { loadFakeDoorStats } from "./fake-door";
import { listGapBoard, GAP_SIDES } from "./gaps";
import { gapIdeaTitle, transferKey, type GapSide } from "./gaps-shared";
import { loadGapTransfers } from "./gap-transfer";
import { loadGapVoices } from "./voices";
import { sharedViewFor } from "./users";
import { chooseWeekPick, describeWeekPick, WEEK_PICK_TAG, weekPickDraft, whoToAsk, type WeekPick, type WeekPickInput } from "./week-pick-shared";

export * from "./week-pick-shared";

/**
 * 周末的一件：取数和变成想法（规则在 week-pick-shared.ts）。只读现成的表、不调 AI；
 * 只给自己有差距清单的账号（朋友读的是主账号那份报告，不替主账号建想法）。
 */

/** 差距清单里开着的每一条，连同它的根据。 */
async function loadInputs(userId: string, today: string): Promise<WeekPickInput[]> {
  const [board, voices, transfers, doors, ideas] = await Promise.all([
    listGapBoard(userId, today),
    loadGapVoices(userId),
    loadGapTransfers(userId),
    loadFakeDoorStats(userId),
    supabaseAdmin.from("ideas").select("title").eq("user_id", userId),
  ]);
  if (ideas.error) throw new Error(ideas.error.message);
  const titles = new Set((ideas.data ?? []).map((i) => i.title as string | null).filter(Boolean));
  return GAP_SIDES.flatMap((side) =>
    board.sides[side].open.map((gap) => {
      const key = transferKey(side, gap.signal_id);
      return {
        side,
        gap,
        voices: voices.get(key) ?? null,
        transfer: transfers.get(key) ?? null,
        signups: doors.get(key)?.signups ?? 0,
        isIdea: titles.has(gapIdeaTitle(gap.headline, side)),
      };
    })
  );
}

/** 这周（东京时间周一起）已经从这里变成过的想法。 */
async function madeThisWeek(userId: string, monday: string): Promise<{ id: string; title: string } | null> {
  const { data, error } = await supabaseAdmin
    .from("ideas")
    .select("id, title")
    .eq("user_id", userId)
    .contains("tags", [WEEK_PICK_TAG])
    .gte("created_at", new Date(Date.parse(`${monday}T00:00:00+09:00`)).toISOString())
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const row = data?.[0];
  return row ? { id: row.id as string, title: (row.title as string | null) ?? "（没有标题）" } : null;
}

export type WeekPickState = { kind: "pick"; pick: WeekPick } | { kind: "done"; idea: { id: string; title: string } };

/**
 * 这周的一件。这周已经点过「变成想法」的，说已经变成了哪一条（不再挑下一条 —— 一周一件）。
 * 朋友的账号、清单是空的返回 null。
 */
export async function loadWeekPick(userId: string, today: string, monday: string): Promise<WeekPickState | null> {
  if ((await sharedViewFor(userId)).shared) return null;
  const done = await madeThisWeek(userId, monday);
  if (done) return { kind: "done", idea: done };
  const choice = chooseWeekPick(await loadInputs(userId, today), today);
  return choice ? { kind: "pick", pick: describeWeekPick(choice.pick, choice) } : null;
}

/** 邮件链接落地页上要摆的那一条（不一定还是这周挑的那条 —— 链接七天有效，清单这几天可能变了）。 */
export async function weekPickFor(userId: string, today: string, side: GapSide, signalId: string): Promise<WeekPick | null> {
  const c = (await loadInputs(userId, today)).find((x) => x.side === side && x.gap.signal_id === signalId);
  return c ? describeWeekPick(c) : null;
}

/**
 * 变成想法：状态「观察」，预填差距清单那几格、最关键的假设和最小实验（先去问谁），带「周末一件」标签。
 * 已经是想法了（同一个标题）就不再建一条，返回原来那条。
 */
export async function createWeekPickIdea(
  userId: string,
  today: string,
  side: GapSide,
  signalId: string
): Promise<{ id: string; title: string; existed: boolean; who: string | null }> {
  if ((await sharedViewFor(userId)).shared) throw new Error("差距清单是主账号那份，朋友的账号建不了这个想法");
  const c = (await loadInputs(userId, today)).find((x) => x.side === side && x.gap.signal_id === signalId);
  if (!c) throw new Error("差距清单里找不到这一条了（可能这边已经有了，挪出了清单）");
  const draft = weekPickDraft(c);
  const who = whoToAsk(c).lines[0]?.who ?? null;
  const { data: existing, error: findError } = await supabaseAdmin.from("ideas").select("id").eq("user_id", userId).eq("title", draft.title).limit(1);
  if (findError) throw new Error(findError.message);
  if (existing && existing.length > 0) return { id: existing[0].id as string, title: draft.title, existed: true, who };
  const { data, error } = await supabaseAdmin
    .from("ideas")
    .insert({ user_id: userId, title: draft.title, status: "观察", tags: draft.tags, hypothesis: draft.hypothesis })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id as string, title: draft.title, existed: false, who };
}
