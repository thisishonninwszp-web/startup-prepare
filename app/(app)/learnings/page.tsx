import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getPatternsSnapshot, getSurvivalCalendar } from "../patterns/queries";
import { getReflectionSettings } from "../retrospectives/queries";
import { PatternReport } from "../patterns/pattern-report";
import { SurvivalCalendar } from "../patterns/survival-calendar";
import { PageContainer } from "@/components/ui/page-container";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="space-y-0.5 rounded-lg border bg-card px-4 py-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default async function LearningsPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
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
  const [snap, reflectionSettings] = await Promise.all([
    getPatternsSnapshot(userId),
    getReflectionSettings(userId),
  ]);
  const survivalCalendar = await getSurvivalCalendar(
    userId,
    reflectionSettings.timezone
  );
  const insights = {
    killedCount: snap.kills.total,
    noPainIdeas: snap.kills.no_pain_kills,
    noPayIdeas: snap.kills.no_pay_kills,
    armchairKills: snap.kills.armchair_kills,
  };
  const hits = snap.predictions.hit;
  const misses = snap.predictions.miss;
  const predTotal = snap.predictions.total;
  const predResolved = hits + misses;
  const hitRate =
    predResolved > 0 ? `${Math.round((hits / predResolved) * 100)}%` : "—";
  const statusItems = Object.entries(snap.ideas.by_status)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${status} ${count}`)
    .join(" · ");

  return (
    <PageContainer width="narrow" className="animate-fade-up">
      <p className="mb-2 text-sm text-muted-foreground">
        归档过的想法、你从中学到的判断力，以及跨全部想法的认知模式。
      </p>
      <a
        href="/learnings/handbook"
        className="mb-6 inline-block text-xs text-muted-foreground underline-offset-4 hover:underline"
      >
        打印“学到了什么”合集手册 →
      </a>

      <Tabs defaultValue={searchParams.tab === "patterns" ? "patterns" : "learned"}>
        <TabsList>
          <TabsTrigger value="learned">学到了</TabsTrigger>
          <TabsTrigger value="patterns">认知镜</TabsTrigger>
        </TabsList>

        <TabsContent value="learned" className="space-y-0">
          {hits + misses > 0 && <CalibrationBlock hits={hits} misses={misses} />}

          {insights.killedCount > 0 && <InsightsBlock insights={insights} />}

          {learnings.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              还没有归档的想法。这里会汇总你 Kill 掉的想法和“学到了什么”。
            </p>
          ) : (
            <ul className="mt-4 grid gap-5 sm:grid-cols-2">
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
        </TabsContent>

        <TabsContent value="patterns">
          <p className="mb-6 mt-4 text-sm text-muted-foreground">
            跨所有想法回望你的决策模式——AI 找盲区，不给鼓励。
          </p>

          <div className="space-y-4">
            <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              数据快照
            </h2>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard
                label="想法总数"
                value={snap.ideas.total}
                sub={statusItems || undefined}
              />
              <StatCard
                label="验证记录"
                value={snap.validations.total}
                sub={
                  snap.validations.total > 0
                    ? `有痛 ${snap.validations.has_pain_yes} · 无痛 ${snap.validations.has_pain_no}`
                    : undefined
                }
              />
              <StatCard
                label="预测命中率"
                value={hitRate}
                sub={
                  predTotal > 0
                    ? `共 ${predTotal} 条预测，${predResolved} 条已决`
                    : "暂无预测"
                }
              />
              <StatCard
                label="空想 Kill"
                value={snap.kills.armchair_kills}
                sub="未验证就否决的想法数"
              />
            </div>

            {snap.validations.total > 0 && (
              <div className="space-y-2 rounded-lg border bg-card px-4 py-3">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  验证信号分布
                </p>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <p className="mb-1 text-muted-foreground">有真实痛苦 (has_pain)</p>
                    <div className="flex gap-3">
                      <span className="text-status-mvp">
                        是 {snap.validations.has_pain_yes}
                      </span>
                      <span className="text-destructive">
                        否 {snap.validations.has_pain_no}
                      </span>
                      <span className="text-muted-foreground">
                        不确定 {snap.validations.has_pain_unsure}
                      </span>
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 text-muted-foreground">愿意付钱 (will_pay)</p>
                    <div className="flex gap-3">
                      <span className="text-status-mvp">
                        是 {snap.validations.will_pay_yes}
                      </span>
                      <span className="text-destructive">
                        否 {snap.validations.will_pay_no}
                      </span>
                      <span className="text-muted-foreground">
                        不确定 {snap.validations.will_pay_unsure}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {snap.reframing.top_marked_frames.length > 0 && (
              <div className="space-y-2 rounded-lg border bg-card px-4 py-3">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  重构标记最多的视角
                </p>
                <div className="flex flex-wrap gap-2">
                  {snap.reframing.top_marked_frames.map((f) => (
                    <span
                      key={f.frame_type}
                      className="rounded-full bg-muted px-2.5 py-0.5 text-xs"
                    >
                      {f.frame_type.replace(/_/g, " ")} × {f.count}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-lg border bg-card px-4 py-3">
              <SurvivalCalendar calendar={survivalCalendar} />
            </div>
          </div>

          <div className="mt-6">
            <PatternReport hasEnoughData={snap.has_enough_data} />
          </div>
        </TabsContent>
      </Tabs>
    </PageContainer>
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
          <div className="rounded-md border border-status-validating/30 bg-status-validating/10 p-3 text-status-validating">
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
