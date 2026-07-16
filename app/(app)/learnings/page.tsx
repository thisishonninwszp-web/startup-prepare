import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getPatternsSnapshot } from "../patterns/queries";

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

  // 判断模式和预测校准的绝对计数来自认知镜的统一快照，避免两处各自重算一遍。
  // 宪法第 1 条：绝不打分、绝不用百分比。
  const snap = await getPatternsSnapshot(userId);
  const insights = {
    killedCount: snap.kills.total,
    noPainIdeas: snap.kills.no_pain_kills,
    noPayIdeas: snap.kills.no_pay_kills,
    armchairKills: snap.kills.armchair_kills,
  };
  const hits = snap.predictions.hit;
  const misses = snap.predictions.miss;

  return (
    <>
      <main className="animate-fade-up mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <p className="mb-2 text-sm text-muted-foreground">
          归档过的想法和你从中学到的判断力。回看它们，是为了下次更早识别同类机会。
        </p>
        <div className="mb-6 flex flex-wrap gap-x-6 gap-y-1">
          <a
            href="/patterns"
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            查看跨全部想法的判断模式（认知镜）→
          </a>
          <a
            href="/learnings/handbook"
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            打印“学到了什么”合集手册 →
          </a>
        </div>

        {hits + misses > 0 && <CalibrationBlock hits={hits} misses={misses} />}

        {insights.killedCount > 0 && <InsightsBlock insights={insights} />}

        {learnings.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            还没有归档的想法。这里会汇总你 Kill 掉的想法和“学到了什么”。
          </p>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2">
            {learnings.map((l) => (
              <li
                key={l.id}
                className="rounded-t-3xl rounded-b-lg border bg-card px-5 pb-4 pt-7"
              >
                <h2 className="text-center font-serif text-base tracking-tight">
                  {l.title}
                </h2>
                <p className="mt-1 text-center text-xs text-muted-foreground">
                  {new Date(l.decided_at).toLocaleDateString()}
                </p>

                {l.learned && (
                  <p className="mt-4 text-center font-serif text-sm italic leading-relaxed">
                    “{l.learned}”
                  </p>
                )}

                {(l.reason.original_judgment ||
                  l.reason.validation_action ||
                  l.reason.real_result) && (
                  <details className="mt-4 border-t pt-3">
                    <summary className="cursor-pointer text-center text-xs text-muted-foreground hover:text-foreground">
                      查看当时的判断
                    </summary>
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
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
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

type Insights = {
  killedCount: number;
  noPainIdeas: number;
  noPayIdeas: number;
  armchairKills: number;
};

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
