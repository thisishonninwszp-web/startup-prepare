import { supabaseAdmin } from "@/lib/supabase";
import { selectAll } from "@/lib/supabase-all";
import type { GapVoices } from "./voices-shared";
import { earliestOf, IDLE_DAYS, isPausedNow, latestOf, PAUSE_KINDS, type PauseFacts, type PauseKind, type PauseState } from "./pause-shared";

export * from "./pause-shared";

/**
 * 停掉没人点的那几样（规则在 pause-shared.ts）：每次现算，不存「停了」这件事，只存他点「恢复」的时候（signal_prefs.resumed，迁移 127）。
 * 「点过」按谁点都算（题库和练习是主账号那一池的，朋友点了也说明有人在用）：
 * - 练习的 AI 先判：写过一条判断（判断账本里任何一条）；
 * - 生意题、到日本题：对这一种的题判断过、看过答案、确认过对账；
 * - 假门先做好：点过「不要」、发布过一个假门。
 * 迁移 127 没跑、哪一样取不到，就当没停（照旧做），不拦着别的。
 */

export const PAUSE_MISSING = "迁移 127 还没跑：在 Supabase 的 SQL Editor 里执行 supabase/migrations/127_signal_pauses.sql。";

type QuestionRow = { id: string; kind: string; created_at: string; revealed_at: string | null; resolved_at: string | null };

async function resumedOf(userId: string): Promise<Partial<Record<PauseKind, string>> | null> {
  const { data, error } = await supabaseAdmin.from("signal_prefs").select("resumed").eq("user_id", userId).maybeSingle();
  if (error) return null;
  return ((data?.resumed as Partial<Record<PauseKind, string>> | null) ?? {}) as Partial<Record<PauseKind, string>>;
}

/** 四样各停没停、最后一次是哪天。迁移 127 没跑返回 null（不停）。 */
export async function loadPauseStates(userId: string, now = Date.now()): Promise<PauseState[] | null> {
  const resumed = await resumedOf(userId);
  if (!resumed) return null;
  const facts = await loadPauseFacts(userId);
  return PAUSE_KINDS.map((kind) => {
    const f = { ...facts[kind], resumedAt: resumed[kind] ?? null };
    return { kind, paused: isPausedNow(f, now), lastTouch: f.lastTouch };
  });
}

/** 四样各是哪天第一次做出来、最后一次有人点（不含「恢复」）。哪一样取不到，那一样就是空的（不停）。 */
export async function loadPauseFacts(userId: string): Promise<Record<PauseKind, PauseFacts>> {
  const [questions, mine, reveals, judgment, brief, voices, door] = await Promise.all([
    selectAll<QuestionRow>((a, b) =>
      supabaseAdmin
        .from("forecast_questions")
        .select("id, kind, created_at, revealed_at, resolved_at")
        .eq("user_id", userId)
        .in("kind", ["business", "arrival"])
        .order("created_at")
        .range(a, b)
    ),
    selectAll<{ question_id: string; made_at: string }>((a, b) => supabaseAdmin.from("forecasts").select("question_id, made_at").eq("source", "me").order("question_id").range(a, b)),
    // 「跳过」= 先看了答案（每人一份，迁移 092）；没有这张表就只看题目上的 revealed_at
    selectAll<{ question_id: string; revealed_at: string }>((a, b) => supabaseAdmin.from("forecast_reveals").select("question_id, revealed_at").order("question_id").range(a, b)),
    supabaseAdmin.from("signal_judgments").select("created_at").order("created_at", { ascending: false }).limit(1),
    supabaseAdmin.from("signal_briefs").select("brief_date").eq("user_id", userId).eq("kind", "news").order("brief_date").limit(1),
    // 直接读这一列，不经 voices.ts（那边引用的东西多，免得互相引用）
    supabaseAdmin.from("signal_gap_voices").select("analysis").eq("user_id", userId).limit(1000),
    supabaseAdmin.from("signal_fake_doors").select("created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(1),
  ]);

  const none: PauseFacts = { firstMade: null, lastTouch: null, resumedAt: null };
  const facts: Record<PauseKind, PauseFacts> = { practice: none, business: none, arrival: none, door: none };

  if (!judgment.error && !brief.error) {
    facts.practice = { firstMade: (brief.data?.[0]?.brief_date as string | undefined) ?? null, lastTouch: (judgment.data?.[0]?.created_at as string | undefined) ?? null, resumedAt: null };
  }
  if (!questions.error && !mine.error) {
    const kindOf = new Map(questions.data.map((q) => [q.id, q.kind]));
    for (const kind of ["business", "arrival"] as const) {
      const qs = questions.data.filter((q) => q.kind === kind);
      facts[kind] = {
        firstMade: earliestOf(qs.map((q) => q.created_at)),
        lastTouch: latestOf([
          ...mine.data.filter((f) => kindOf.get(f.question_id) === kind).map((f) => f.made_at),
          ...(reveals.error ? [] : reveals.data).filter((r) => kindOf.get(r.question_id) === kind).map((r) => r.revealed_at),
          ...qs.map((q) => q.revealed_at),
          ...qs.map((q) => q.resolved_at),
        ]),
        resumedAt: null,
      };
    }
  }
  if (!voices.error && !door.error) {
    const rows = ((voices.data ?? []) as { analysis: GapVoices }[]).map((r) => r.analysis).filter(Boolean);
    facts.door = {
      // 自动「听一听」也是这一步做的，所以从第一次听算起
      firstMade: earliestOf(rows.map((v) => v.created_at)),
      lastTouch: latestOf([...rows.map((v) => v.door_draft?.dismissed_at), (door.data?.[0]?.created_at as string | undefined) ?? null]),
      resumedAt: null,
    };
  }

  return facts;
}

/** 停了的那几样；取不到就当一样都没停。 */
export async function pausedKinds(userId: string): Promise<Set<PauseKind>> {
  try {
    const states = await loadPauseStates(userId);
    return new Set((states ?? []).filter((s) => s.paused).map((s) => s.kind));
  } catch (e) {
    console.error("pauses", e);
    return new Set();
  }
}

/** 他点了「恢复」：从现在起再看两周（IDLE_DAYS）。 */
export async function resumeGeneration(userId: string, kind: PauseKind): Promise<void> {
  if (!PAUSE_KINDS.includes(kind)) throw new Error("没有这一样");
  const resumed = await resumedOf(userId);
  if (!resumed) throw new Error(PAUSE_MISSING);
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("signal_prefs")
    .upsert({ user_id: userId, resumed: { ...resumed, [kind]: now }, updated_at: now }, { onConflict: "user_id" });
  if (error) throw new Error(/resumed/.test(error.message) ? PAUSE_MISSING : error.message);
}

export const RESUMED_MESSAGE = `恢复了：明天起照旧做，再看 ${IDLE_DAYS} 天。`;
