import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  AI_ROLES,
  HYPOTHESIS_FIELDS,
  type AiRole,
  type ChatTurn,
  type Hypothesis,
  type Prediction,
  type Validation,
  type Verdict,
  visibleTags,
} from "../../types";
import {
  getBayesianBeliefsForIdea,
  getFermiEstimatesForIdea,
  getReframingSessionsForIdea,
} from "@/app/(app)/reasoning/queries";
import { PrintButton } from "@/components/print-button";
import { PageContainer } from "@/components/ui/page-container";

export const dynamic = "force-dynamic";

const VERDICT_LABEL: Record<Verdict, string> = {
  Go: "Go · 进入 MVP 候选",
  Kill: "Kill · 归档",
  Pivot: "Pivot · 转向调整假设",
  Hold: "Hold · 暂时观望",
};

const SIGNAL_LABEL: Record<string, string> = {
  yes: "是",
  no: "否",
  unsure: "不确定",
};

const ROLE_LABEL: Record<string, string> = {
  investor: "挑剔投资人",
  customer: "顾客质疑",
  operator: "冷酷运营者",
  competitor: "竞品老板",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

type Decision = {
  verdict: string;
  reason: string | null;
  learned: string | null;
  decided_at: string;
};

export default async function IdeaReportPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: idea, error: ideaError } = await supabaseAdmin
    .from("ideas")
    .select("id, user_id, title, status, tags, hypothesis, created_at, last_activity_at")
    .eq("id", params.id)
    .maybeSingle();
  if (ideaError) throw new Error(ideaError.message);
  if (!idea || idea.user_id !== user.id) notFound();

  const [
    sessionsResult,
    validationsResult,
    predictionsResult,
    decisionsResult,
    beliefs,
    estimates,
    reframings,
  ] = await Promise.all([
    supabaseAdmin
      .from("ai_sessions")
      .select("role, messages")
      .eq("idea_id", params.id)
      .in("role", AI_ROLES.map((r) => r.key)),
    supabaseAdmin
      .from("validations")
      .select("id, has_pain, will_pay, note, contacted_at")
      .eq("idea_id", params.id)
      .order("contacted_at", { ascending: true }),
    supabaseAdmin
      .from("predictions")
      .select("id, text, due_at, made_at, outcome, resolved_at, note")
      .eq("idea_id", params.id)
      .order("made_at", { ascending: true }),
    supabaseAdmin
      .from("decisions")
      .select("verdict, reason, learned, decided_at")
      .eq("idea_id", params.id)
      .order("decided_at", { ascending: false })
      .limit(1),
    getBayesianBeliefsForIdea(params.id, user.id),
    getFermiEstimatesForIdea(params.id, user.id),
    getReframingSessionsForIdea(params.id, user.id),
  ]);

  const hypothesis = (idea.hypothesis ?? {}) as Hypothesis;
  const tags = visibleTags(idea.tags ?? []);
  const validations = (validationsResult.data ?? []) as Validation[];
  const predictions = (predictionsResult.data ?? []) as Prediction[];
  const decision = (decisionsResult.data?.[0] ?? null) as Decision | null;

  // Build AI critique map: role → first assistant message
  const critiqueMap: Record<string, string> = {};
  for (const s of sessionsResult.data ?? []) {
    if (Array.isArray(s.messages)) {
      const firstAssistant = (s.messages as ChatTurn[]).find(
        (m) => m.role === "assistant"
      );
      if (firstAssistant) critiqueMap[s.role as AiRole] = firstAssistant.content;
    }
  }
  const critiqueEntries = AI_ROLES.filter((r) => critiqueMap[r.key]);

  const hasReasoningTools =
    beliefs.length > 0 || estimates.length > 0 || reframings.length > 0;

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { font-size: 13px; }
          h2 { margin-top: 1.5rem; }
        }
        @page { margin: 2cm; }
      `}</style>

      <PageContainer width="narrow" className="text-sm">
        {/* 返回 + 打印 */}
        <div className="no-print mb-8 flex items-center justify-between">
          <Link
            href={`/ideas/${idea.id}`}
            className="text-xs text-muted-foreground hover:underline"
          >
            ← 返回想法详情
          </Link>
          <PrintButton />
        </div>

        {/* ① 标题栏 */}
        <header className="mb-8 border-b pb-6">
          <p className="mb-1 text-xs text-muted-foreground">决策报告</p>
          <h1 className="text-2xl font-bold leading-snug">
            {idea.title?.trim() || "（无标题）"}
          </h1>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span>状态：{idea.status}</span>
            <span>创建：{fmtDate(idea.created_at)}</span>
            {decision && <span>决策：{fmtDate(decision.decided_at)}</span>}
          </div>
          {tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </header>

        {/* ② 假设 */}
        <section className="mb-8">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            假设
          </h2>
          <div className="space-y-2">
            {HYPOTHESIS_FIELDS.map((f) => {
              const val = hypothesis[f.key];
              if (!val) return null;
              return (
                <div key={f.key} className="flex gap-3">
                  <span className="w-24 shrink-0 text-xs text-muted-foreground">
                    {f.label}
                  </span>
                  <span className="text-sm leading-snug">{val}</span>
                </div>
              );
            })}
            {hypothesis.riskiest_assumption && (
              <div className="flex gap-3">
                <span className="w-24 shrink-0 text-xs text-muted-foreground">
                  最关键假设
                </span>
                <span className="text-sm leading-snug">
                  {hypothesis.riskiest_assumption}
                </span>
              </div>
            )}
            {hypothesis.smallest_test && (
              <div className="flex gap-3">
                <span className="w-24 shrink-0 text-xs text-muted-foreground">
                  最小实验
                </span>
                <span className="text-sm leading-snug">
                  {hypothesis.smallest_test}
                </span>
              </div>
            )}
          </div>
        </section>

        {/* ③ 验证轨迹 */}
        {validations.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              验证轨迹（{validations.length} 次）
            </h2>
            <div className="space-y-3">
              {validations.map((v, i) => (
                <div key={v.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-muted-foreground">
                      #{i + 1} · {fmtDate(v.contacted_at)}
                    </span>
                    <span className="flex gap-3 text-xs">
                      <span>
                        有痛：
                        <span
                          className={
                            v.has_pain === "yes"
                              ? "text-status-mvp"
                              : v.has_pain === "no"
                              ? "text-destructive"
                              : "text-muted-foreground"
                          }
                        >
                          {SIGNAL_LABEL[v.has_pain]}
                        </span>
                      </span>
                      <span>
                        愿付：
                        <span
                          className={
                            v.will_pay === "yes"
                              ? "text-status-mvp"
                              : v.will_pay === "no"
                              ? "text-destructive"
                              : "text-muted-foreground"
                          }
                        >
                          {SIGNAL_LABEL[v.will_pay]}
                        </span>
                      </span>
                    </span>
                  </div>
                  {v.note && (
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {v.note}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ④ AI 质疑摘要 */}
        {critiqueEntries.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              AI 对抗视角摘要
            </h2>
            <div className="space-y-3">
              {critiqueEntries.map((r) => (
                <div key={r.key} className="rounded-lg border p-3">
                  <p className="mb-1.5 text-xs font-medium">
                    {ROLE_LABEL[r.key] ?? r.label}
                  </p>
                  <p className="text-sm leading-relaxed text-muted-foreground line-clamp-4">
                    {critiqueMap[r.key]}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ⑤ 推理工具 */}
        {hasReasoningTools && (
          <section className="mb-8">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              推理工具记录
            </h2>
            <div className="space-y-2">
              {beliefs.map((b) => (
                <div key={b.id} className="flex items-center gap-3 rounded border p-3">
                  <span className="text-xs text-muted-foreground w-14 shrink-0">
                    贝叶斯
                  </span>
                  <span className="flex-1 text-sm">{b.question}</span>
                  <span className="shrink-0 text-xs tabular-nums">
                    {(b.prior * 100).toFixed(0)}%
                    <span className="mx-1 text-muted-foreground">→</span>
                    <span
                      className={
                        b.current_posterior < 0.3
                          ? "text-destructive"
                          : b.current_posterior > 0.7
                          ? "text-status-mvp"
                          : ""
                      }
                    >
                      {(b.current_posterior * 100).toFixed(0)}%
                    </span>
                  </span>
                </div>
              ))}
              {estimates.map((e) => (
                <div key={e.id} className="flex items-center gap-3 rounded border p-3">
                  <span className="text-xs text-muted-foreground w-14 shrink-0">
                    费米
                  </span>
                  <span className="flex-1 text-sm">{e.question}</span>
                  {e.final_low != null && e.final_high != null && (
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {e.final_low.toLocaleString()} – {e.final_high.toLocaleString()}
                      {e.unit ? ` ${e.unit}` : ""}
                    </span>
                  )}
                </div>
              ))}
              {reframings.map((s) => (
                <div key={s.id} className="flex items-center gap-3 rounded border p-3">
                  <span className="text-xs text-muted-foreground w-14 shrink-0">
                    重构
                  </span>
                  <span className="flex-1 text-sm">{s.topic_text}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ⑥ 预测结果 */}
        {predictions.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              预测与对账（{predictions.length} 条）
            </h2>
            <div className="space-y-2">
              {predictions.map((p) => (
                <div key={p.id} className="flex items-start gap-3 rounded border p-3">
                  <span
                    className={`mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      p.outcome === "hit"
                        ? "bg-status-mvp/15 text-status-mvp"
                        : p.outcome === "miss"
                        ? "bg-destructive/15 text-destructive"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {p.outcome === "hit"
                      ? "命中"
                      : p.outcome === "miss"
                      ? "未中"
                      : "待定"}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm leading-snug">{p.text}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      截止 {fmtDate(p.due_at)}
                      {p.note ? ` · ${p.note}` : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ⑦ 决策 */}
        {decision && (
          <section className="mb-8 rounded-lg border-2 p-5">
            <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              决策
            </h2>
            <p className="text-2xl font-bold">
              {VERDICT_LABEL[decision.verdict as Verdict] ?? decision.verdict}
            </p>
            {decision.reason && (
              <div className="mt-4">
                <p className="text-xs font-medium text-muted-foreground">决策理由</p>
                <p className="mt-1 text-sm leading-relaxed">{decision.reason}</p>
              </div>
            )}
            {decision.learned && (
              <div className="mt-4">
                <p className="text-xs font-medium text-muted-foreground">
                  学到了什么
                </p>
                <p className="mt-1 text-sm leading-relaxed">{decision.learned}</p>
              </div>
            )}
          </section>
        )}

        {/* 页脚 */}
        <footer className="mt-12 border-t pt-4 text-xs text-muted-foreground">
          <p>IdeaOS · 生成于 {fmtDate(new Date().toISOString())}</p>
        </footer>
      </PageContainer>
    </>
  );
}
