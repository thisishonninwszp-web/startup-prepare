import { supabaseAdmin } from "@/lib/supabase";
import { selectAll } from "@/lib/supabase-all";
import { signalKindOf, type SignalKind } from "./feeds";
import { tallyFeedback } from "./feedback";
import { HABIT_DAYS, orderSections, type SectionHabit } from "./section-habits-shared";

/**
 * 他最近 30 天在每一节的动作：点开几次（迁移 100 的 signal_opens）、标了几条、点了几次有用 / 没用。
 * 哪张表没建就当那一样是 0。版面顺序和收起来的几节见 section-habits-shared.ts。
 */
export async function sectionHabits(userId: string): Promise<SectionHabit[]> {
  const since = new Date(Date.now() - HABIT_DAYS * 86_400_000);
  const [opens, marks, feedback] = await Promise.all([
    selectAll((a, b) =>
      supabaseAdmin
        .from("signal_opens")
        .select("external_signals!inner(source)")
        .eq("user_id", userId)
        .gte("opened_on", since.toISOString().slice(0, 10))
        .order("opened_on")
        .range(a, b)
    ),
    selectAll((a, b) =>
      supabaseAdmin.from("signal_marks").select("external_signals!inner(source)").eq("user_id", userId).gte("created_at", since.toISOString()).order("created_at").range(a, b)
    ),
    tallyFeedback(userId, HABIT_DAYS).catch(() => []),
  ]);
  const habits = new Map<SignalKind, SectionHabit>();
  const get = (k: SignalKind) => habits.get(k) ?? habits.set(k, { kind: k, opens: 0, marks: 0, useful: 0, useless: 0 }).get(k)!;
  for (const r of opens.error ? [] : (opens.data as unknown as { external_signals: { source: string } }[])) get(signalKindOf(r.external_signals.source)).opens += 1;
  for (const r of marks.error ? [] : (marks.data as unknown as { external_signals: { source: string } }[])) get(signalKindOf(r.external_signals.source)).marks += 1;
  for (const f of feedback) {
    const h = get(f.kind as SignalKind);
    h.useful += f.useful;
    h.useless += f.useless;
  }
  return Array.from(habits.values());
}

/** 这个人的版面顺序和收起来的几节（取不到就照默认）。 */
export async function sectionLayout(userId: string, defaults: SignalKind[]): Promise<{ order: SignalKind[]; folded: SignalKind[] }> {
  const habits = await sectionHabits(userId).catch((e) => {
    console.error("section habits", e);
    return [];
  });
  return orderSections(defaults, habits);
}
