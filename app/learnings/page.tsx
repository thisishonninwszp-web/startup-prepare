import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { AppShell } from "@/components/app-shell";

export const dynamic = "force-dynamic";

type ReasonParts = {
  original_judgment?: string;
  validation_action?: string;
  real_result?: string;
};

function parseReason(reason: string | null): ReasonParts {
  if (!reason) return {};
  try {
    return JSON.parse(reason) as ReasonParts;
  } catch {
    return {};
  }
}

type Insights = {
  killedCount: number;
  noPainIdeas: number;
  noPayIdeas: number;
  armchairKills: number;
};

/** 跨被 Kill 的想法聚合验证信号，得出绝对计数（不打分、不用百分比）。 */
async function computeInsights(killedIdeaIds: string[]): Promise<Insights> {
  const killedCount = killedIdeaIds.length;
  if (killedCount === 0) {
    return { killedCount: 0, noPainIdeas: 0, noPayIdeas: 0, armchairKills: 0 };
  }

  const { data: vals, error } = await supabaseAdmin
    .from("validations")
    .select("idea_id, has_pain, will_pay")
    .in("idea_id", killedIdeaIds);
  if (error) throw new Error(error.message);

  const byIdea = new Map<string, { has_pain: string; will_pay: string }[]>();
  for (const v of vals ?? []) {
    const id = v.idea_id as string;
    const arr = byIdea.get(id) ?? [];
    arr.push({ has_pain: v.has_pain as string, will_pay: v.will_pay as string });
    byIdea.set(id, arr);
  }

  let noPainIdeas = 0;
  let noPayIdeas = 0;
  let armchairKills = 0;
  for (const id of killedIdeaIds) {
    const arr = byIdea.get(id);
    if (!arr || arr.length === 0) {
      armchairKills++; // 没接触任何真人就否决了
      continue;
    }
    if (arr.some((v) => v.has_pain === "no")) noPainIdeas++;
    if (arr.some((v) => v.will_pay === "no")) noPayIdeas++;
  }

  return { killedCount, noPainIdeas, noPayIdeas, armchairKills };
}

export default async function LearningsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user!.id;

  const { data: rows, error: rowsError } = await supabaseAdmin
    .from("decisions")
    .select("id, idea_id, reason, learned, decided_at, ideas!inner(title, user_id)")
    .eq("verdict", "Kill")
    .eq("ideas.user_id", userId)
    .order("decided_at", { ascending: false });
  if (rowsError) throw new Error(rowsError.message);

  const learnings = (rows ?? []).map((r) => {
    // 嵌套关系在 PostgREST 里可能是对象或单元素数组，做个兼容。
    const ideaRel = r.ideas as unknown;
    const idea = Array.isArray(ideaRel) ? ideaRel[0] : ideaRel;
    return {
      id: r.id as string,
      title: (idea?.title as string) ?? "（无标题）",
      learned: r.learned as string | null,
      reason: parseReason(r.reason as string | null),
      decided_at: r.decided_at as string,
    };
  });

  // 判断模式：跨所有 Kill 的想法 + 验证记录，用绝对计数 + 定性句揭示反复偏误。
  // 宪法第 1 条：绝不打分、绝不用百分比。
  const killedIdeaIds = Array.from(
    new Set((rows ?? []).map((r) => r.idea_id as string))
  );
  const insights = await computeInsights(killedIdeaIds);

  // 校准：跨所有想法，已对账的预测命中/没命中计数（不打分、不用百分比）。
  const { data: resolvedPreds, error: resolvedPredsError } = await supabaseAdmin
    .from("predictions")
    .select("outcome, ideas!inner(user_id)")
    .eq("ideas.user_id", userId)
    .in("outcome", ["hit", "miss"]);
  if (resolvedPredsError) throw new Error(resolvedPredsError.message);
  const hits = (resolvedPreds ?? []).filter((p) => p.outcome === "hit").length;
  const misses = (resolvedPreds ?? []).filter((p) => p.outcome === "miss").length;

  return (
    <AppShell>
      <main className="animate-fade-up mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <p className="mb-6 text-sm text-muted-foreground">
          归档过的想法和你从中学到的判断力。回看它们，是为了下次更早识别同类机会。
        </p>

        {hits + misses > 0 && <CalibrationBlock hits={hits} misses={misses} />}

        {insights.killedCount > 0 && <InsightsBlock insights={insights} />}

        {learnings.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            还没有归档的想法。这里会汇总你 Kill 掉的想法和“学到了什么”。
          </p>
        ) : (
          <ul className="space-y-4">
            {learnings.map((l) => (
              <li key={l.id} className="rounded-lg border p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-sm font-medium">{l.title}</h2>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(l.decided_at).toLocaleDateString()}
                  </span>
                </div>

                {l.learned && (
                  <div className="mt-3 rounded-md bg-muted/40 p-3">
                    <div className="text-xs font-medium text-muted-foreground">
                      学到什么
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{l.learned}</p>
                  </div>
                )}

                <dl className="mt-3 space-y-2 text-sm">
                  {l.reason.original_judgment && (
                    <Row label="原始判断" value={l.reason.original_judgment} />
                  )}
                  {l.reason.validation_action && (
                    <Row label="验证动作" value={l.reason.validation_action} />
                  )}
                  {l.reason.real_result && (
                    <Row label="真实结果" value={l.reason.real_result} />
                  )}
                </dl>
              </li>
            ))}
          </ul>
        )}
      </main>
    </AppShell>
  );
}

function CalibrationBlock({ hits, misses }: { hits: number; misses: number }) {
  return (
    <section className="mb-8 rounded-lg border bg-card p-5">
      <h2 className="text-sm font-medium">预测校准</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        你下注前的判断，被现实验证得怎么样。看见落差，下次少自欺。
      </p>
      <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <span className={hits >= misses ? "font-medium" : "text-muted-foreground"}>
          命中 · <span className="font-mono tabular-nums">{hits}</span>
        </span>
        <span className={misses > hits ? "font-medium" : "text-muted-foreground"}>
          没命中 · <span className="font-mono tabular-nums">{misses}</span>
        </span>
      </div>
      {misses > hits && (
        <p className="mt-3 text-sm text-muted-foreground">
          你“没命中”的次数更多——你的直觉系统性地偏乐观。下注前先想想这一点。
        </p>
      )}
    </section>
  );
}

function InsightsBlock({ insights }: { insights: Insights }) {
  const { killedCount, noPainIdeas, noPayIdeas, armchairKills } = insights;
  const hasCause = noPainIdeas > 0 || noPayIdeas > 0;

  return (
    <section className="mb-8 rounded-lg border bg-card p-5">
      <h2 className="text-sm font-medium">判断模式</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        这些是你反复犯的偏误。看见它，是为了下次更早识破。
      </p>

      <div className="mt-4 space-y-4 text-sm">
        <p>
          你一共归档了{" "}
          <span className="font-mono tabular-nums">{killedCount}</span> 个想法。
        </p>

        {armchairKills > 0 && (
          <div className="rounded-md border border-orange-300 bg-orange-50 p-3 text-orange-800">
            其中{" "}
            <span className="font-mono tabular-nums">{armchairKills}</span>{" "}
            个，你没有接触任何真人就否决了。分析跨不过同理心鸿沟。
          </div>
        )}

        {hasCause ? (
          <div>
            <div className="text-xs text-muted-foreground">最常见的死因</div>
            <div className="mt-2 flex flex-wrap gap-x-8 gap-y-2">
              <span
                className={
                  noPainIdeas >= noPayIdeas ? "font-medium" : "text-muted-foreground"
                }
              >
                没人真的痛 ·{" "}
                <span className="font-mono tabular-nums">{noPainIdeas}</span> 个
              </span>
              <span
                className={
                  noPayIdeas > noPainIdeas ? "font-medium" : "text-muted-foreground"
                }
              >
                没人愿意付钱 ·{" "}
                <span className="font-mono tabular-nums">{noPayIdeas}</span> 个
              </span>
            </div>
          </div>
        ) : armchairKills === killedCount ? (
          <p className="text-muted-foreground">
            你 Kill 的想法都没有任何真实验证数据——这本身就是最该警惕的模式。
          </p>
        ) : null}
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-wrap">{value}</dd>
    </div>
  );
}
