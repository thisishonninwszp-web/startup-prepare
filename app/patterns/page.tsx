import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PersonalLayerNav } from "@/components/personal-layer-nav";
import { getPatternsSnapshot } from "./queries";
import { PatternReport } from "./pattern-report";

export const dynamic = "force-dynamic";

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
    <div className="rounded-lg border bg-card px-4 py-3 space-y-0.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default async function PatternsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const snap = await getPatternsSnapshot(user.id);

  const predTotal = snap.predictions.total;
  const predResolved = snap.predictions.hit + snap.predictions.miss;
  const hitRate =
    predResolved > 0
      ? `${Math.round((snap.predictions.hit / predResolved) * 100)}%`
      : "—";

  const statusItems = Object.entries(snap.ideas.by_status)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${status} ${count}`)
    .join(" · ");

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <PersonalLayerNav current="/patterns" />
      <div className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight">认知镜</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          跨所有想法回望你的决策模式——AI 找盲区，不给鼓励。
        </p>
      </div>

      {/* 数据快照 */}
      <div className="mb-10 space-y-4">
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

        {/* Kill 死因 */}
        {snap.kills.total > 0 && (
          <div className="rounded-lg border bg-card px-4 py-3 space-y-2">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Kill 想法的死因（共 {snap.kills.total} 个）
            </p>
            <div className="flex flex-wrap gap-x-8 gap-y-2 text-xs">
              <span className="text-muted-foreground">
                空想 Kill · <span className="font-mono tabular-nums text-foreground">{snap.kills.armchair_kills}</span>
              </span>
              <span className="text-muted-foreground">
                没人真的痛 · <span className="font-mono tabular-nums text-foreground">{snap.kills.no_pain_kills}</span>
              </span>
              <span className="text-muted-foreground">
                没人愿意付钱 · <span className="font-mono tabular-nums text-foreground">{snap.kills.no_pay_kills}</span>
              </span>
            </div>
            <a
              href="/learnings"
              className="inline-block text-xs text-foreground underline-offset-4 hover:underline"
            >
              查看每个 Kill 想法的完整学习记录 →
            </a>
          </div>
        )}

        {/* 验证信号分布 */}
        {snap.validations.total > 0 && (
          <div className="rounded-lg border bg-card px-4 py-3 space-y-2">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              验证信号分布
            </p>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="text-muted-foreground mb-1">有真实痛苦 (has_pain)</p>
                <div className="flex gap-3">
                  <span className="text-green-600 dark:text-green-400">
                    是 {snap.validations.has_pain_yes}
                  </span>
                  <span className="text-red-600 dark:text-red-400">
                    否 {snap.validations.has_pain_no}
                  </span>
                  <span className="text-muted-foreground">
                    不确定 {snap.validations.has_pain_unsure}
                  </span>
                </div>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">愿意付钱 (will_pay)</p>
                <div className="flex gap-3">
                  <span className="text-green-600 dark:text-green-400">
                    是 {snap.validations.will_pay_yes}
                  </span>
                  <span className="text-red-600 dark:text-red-400">
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

        {/* 重构高频视角 */}
        {snap.reframing.top_marked_frames.length > 0 && (
          <div className="rounded-lg border bg-card px-4 py-3 space-y-2">
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
      </div>

      {/* AI 认知分析 */}
      <PatternReport hasEnoughData={snap.has_enough_data} />
    </div>
  );
}
