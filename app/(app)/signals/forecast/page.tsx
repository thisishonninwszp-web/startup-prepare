import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { tokyoToday } from "@/lib/domains/signals/brief";
import {
  boardSections,
  needsConfirm,
  calibrationBins,
  headToHead,
  KIND_LABELS,
  loadForecastBoard,
  MIN_BIN,
  MIN_SCORED,
  pct,
  scoreBySource,
  SOURCE_LABELS,
  type ForecastSource,
} from "@/lib/domains/signals/forecast";
import { Answers, ConfirmCard, ForecastCard, PublishManifold } from "./forecast-cards";
import { canPublish } from "@/lib/domains/signals/forecast";
import { manifoldKey } from "@/lib/domains/signals/manifold-publish";
import { ExperimentRow, ProposalCard } from "./experiment-cards";
import { compareBoard } from "@/lib/domains/signals/compare";
import { CompareSection } from "../compare-section";
import { loadExperimentBoard, type ExperimentBoard } from "@/lib/domains/signals/experiments";
import { BIN_MIN } from "@/lib/domains/signals/calibration-shared";
import Link from "next/link";
import { describePlatt, SCORE_MIN, usableCalibration } from "@/lib/domains/signals/calibration-shared";
import { historyBacktest } from "@/lib/domains/signals/backtest";

export const dynamic = "force-dynamic";

const PAIRS: [ForecastSource, ForecastSource][] = [
  ["me", "ai"],
  ["ai", "market"],
  ["me", "market"],
];

/** 先猜自己实验的结果：能猜的、在等的、对过账的、准不准。 */
function ExperimentsSection({ board }: { board: ExperimentBoard | "missing-schema" | null }) {
  if (board === null) return null;
  return (
    <section id="experiments" className="mb-10 scroll-mt-20">
      <h2 className="mb-1 text-base font-semibold">你的实验：先猜结果</h2>
      <p className="mb-3 text-xs leading-6 text-muted-foreground">
        创业最要练的判断是「陌生人会怎么做」。假门开着、周刊刚发出去时先猜一下，一两周后系统自己对账（周刊要你填了数）。门槛按你以前同类实验的中位数定，只数次数，不算转化率，也不给想法打分。
      </p>
      {board === "missing-schema" ? (
        <p className="text-sm leading-7 text-muted-foreground">还差一步：迁移 095 没跑。执行 supabase/migrations/095_experiment_forecasts.sql 之后这里就能用。</p>
      ) : board.proposals.length === 0 && board.open.length === 0 && board.waiting.length === 0 && board.resolved.length === 0 ? (
        <p className="text-sm leading-7 text-muted-foreground">
          现在没有能猜的：在
          <Link href="/signals/gaps" className="mx-1 text-primary underline-offset-4 hover:underline">
            差距清单
          </Link>
          开一个假门、或者把
          <Link href="/signals/issue" className="mx-1 text-primary underline-offset-4 hover:underline">
            周刊
          </Link>
          发出去，就会出现在这里。
        </p>
      ) : (
        <>
          {board.proposals.length > 0 && (
            <ul className="mb-4 space-y-3">
              {board.proposals.map((p) => (
                <ProposalCard key={`${p.kind}-${p.targetId}-${p.platform}`} p={p} />
              ))}
            </ul>
          )}
          {[...board.waiting, ...board.open].length > 0 && (
            <>
              <p className="mb-1 text-xs text-muted-foreground">猜过、还没对账的</p>
              <ul className="mb-4 space-y-1">
                {board.waiting.map((f) => (
                  <ExperimentRow key={f.id} f={f} waiting />
                ))}
                {board.open.map((f) => (
                  <ExperimentRow key={f.id} f={f} />
                ))}
              </ul>
            </>
          )}
          {board.resolved.length > 0 && (
            <>
              <p className="mb-1 text-xs text-muted-foreground">对过账的</p>
              <ul className="space-y-1">
                {board.resolved.slice(0, 10).map((f) => (
                  <ExperimentRow key={f.id} f={f} />
                ))}
              </ul>
              <p className="mt-2 text-xs leading-6 text-muted-foreground">
                {board.stats.brier !== null
                  ? `对过账的 ${board.stats.n} 道，你的平均分 ${board.stats.brier.toFixed(3)}（永远说五成是 0.250）。`
                  : `对过账的 ${board.stats.n} 道，满 ${SCORE_MIN} 道才给分。`}
                {board.stats.bins
                  .filter((b) => b.n >= BIN_MIN)
                  .map((b) => ` 说 ${Math.round(b.lo * 100)}–${Math.round(b.hi * 100)}% 的 ${b.n} 道，到了 ${b.happened} 道。`)
                  .join("")}
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
}

export default async function ForecastPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const today = tokyoToday();
  const [board, report, experiments] = await Promise.all([
    loadForecastBoard(user.id),
    historyBacktest().catch(() => null),
    loadExperimentBoard(user.id, today).catch((e) => {
      console.error("forecast: experiments", e);
      return null;
    }),
  ]);
  const compare = await compareBoard(user.id).catch((e) => {
    console.error("forecast: compare", e);
    return null;
  });
  const calibration = report ? usableCalibration(report) : null;
  const manifoldReady = manifoldKey() !== null;

  return (
    <PageContainer width="narrow">
      <PageHeader
        eyebrow="Forecasts"
        title="预测"
        description="每天进几道能对账的题：预测市场上的（到期平台自己结算，还带着市场给的几成可能当对照）、从今天新闻里出的生意题（到期程序查证据，出题的人确认）。每道题你先说你觉得有几成可能会发生，再看 AI 和市场怎么说 —— AI 用三种思路各给一个、取中间。对账多了，就看得出你、AI、市场谁更准，准在哪类题上。"
      />

      {board === "missing-schema" ? (
        <p className="text-sm leading-7 text-muted-foreground">
          还差一步：迁移 091 没跑。执行 supabase/migrations/091_signal_memory_forecasts.sql 之后，题目每天早上 7:30 和晚上 7 点由后台进来。
        </p>
      ) : (
        (() => {
          const { questions, forecasts } = board;
          const has = (qid: string, s: ForecastSource) => forecasts.some((f) => f.question_id === qid && f.source === s);
          // 生意题到期后由出题的主账号确认；别的账号在「判断过的」里看到它在等确认（「今天」一页用同一套分组）
          const { toForecast, toConfirm, open, done } = boardSections(board, today);
          const scores = scoreBySource(questions, forecasts, ["me", "ai", "market", "base", "ai_outside", "ai_inside", "ai_devil"]);
          const bins = (["ai", "me"] as ForecastSource[]).map((s) => ({ s, bins: calibrationBins(questions, forecasts, s) }));

          if (questions.length === 0) {
            return board.shared ? (
              <p className="text-sm leading-7 text-muted-foreground">这里空着。题目每天早上 7:30 和晚上 7 点进来，大家共用同一批题，各自判断、各自算分。</p>
            ) : (
              <p className="text-sm leading-7 text-muted-foreground">
                这里空着。题目每天早上 7:30 和晚上 7 点由后台进来（GitHub 上的定时任务调用这个网站；要在 GitHub 仓库的 Settings → Secrets 里加一个
                CRON_SECRET，值和 Vercel 里的一样）。也可以在 GitHub 的 Actions 页面手动点一次「signals-jobs」。
              </p>
            );
          }

          return (
            <>
              <section className="mb-10">
                <h2 className="mb-3 text-base font-semibold">等你判断（{toForecast.length}）</h2>
                {toForecast.length === 0 ? (
                  <p className="text-sm text-muted-foreground">这会儿没有等你判断的题。新题每天早上和晚上进来。</p>
                ) : (
                  <ul className="space-y-4">
                    {toForecast.map((q) => (
                      <ForecastCard key={q.id} q={q} />
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-xs leading-6 text-muted-foreground">
                  先说你的判断、再看 AI 和市场 —— 先看了再判断，填的就是它们的数，账本就不是你的了。判断了不能改：改了就没法知道你当时准不准。
                  {board.shared ? " 大家共用同一批题，但你的判断和分数只有你自己看得到。" : ""}
                </p>
              </section>

              <ExperimentsSection board={experiments} />

              {toConfirm.length > 0 && (
                <section className="mb-10">
                  <h2 className="mb-3 text-base font-semibold">到期了，等你确认（{toConfirm.length}）</h2>
                  <ul className="space-y-4">
                    {toConfirm.map((q) => (
                      <ConfirmCard key={q.id} q={q} forecasts={forecasts} />
                    ))}
                  </ul>
                </section>
              )}

              <section className="mb-10">
                <h2 className="mb-3 text-base font-semibold">记分</h2>
                <p className="mb-3 text-sm leading-7">
                  线上的题几个月才对一次账；在{" "}
                  <Link href="/signals/calibrate" className="text-primary underline-offset-4 hover:underline">
                    校准练习
                  </Link>{" "}
                  里，AI 不知道答案的历史题当天就能对账
                  {report && report.n >= SCORE_MIN ? (
                    <>
                      ：{report.n} 道上 AI 平均分 <span className="font-mono">{report.aiBrier.toFixed(3)}</span>
                      {report.marketBrier !== null && (
                        <>
                          、那天的市场 <span className="font-mono">{report.marketBrier.toFixed(3)}</span>
                        </>
                      )}
                      {report.platt ? `；${describePlatt(report.platt)}` : ""}。
                    </>
                  ) : (
                    "（题库还在攒）。"
                  )}
                </p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="py-1 font-normal">谁</th>
                      <th className="py-1 text-right font-normal">对过账的题</th>
                      <th className="py-1 text-right font-normal">平均分（越小越准）</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {scores.map((s) => (
                      <tr key={s.source} className="border-t border-border">
                        <td className="py-1 font-sans">{SOURCE_LABELS[s.source]}</td>
                        <td className="py-1 text-right">{s.n}</td>
                        <td className="py-1 text-right">{s.brier !== null ? s.brier.toFixed(3) : `满 ${MIN_SCORED} 道才算`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <ul className="mt-3 space-y-1 text-sm leading-7">
                  {PAIRS.map(([a, b]) => {
                    const h = headToHead(questions, forecasts, a, b);
                    return (
                      <li key={`${a}-${b}`}>
                        <span className="text-muted-foreground">
                          {SOURCE_LABELS[a]} 对 {SOURCE_LABELS[b]}：
                        </span>
                        {h.n === 0 ? (
                          "还没有两边都判断过、又对过账的题"
                        ) : (
                          <>
                            两边都判断过的 {h.n} 道里，{SOURCE_LABELS[a]}更近 {h.aBetter} 道、{SOURCE_LABELS[b]}更近 {h.bBetter} 道
                            {h.tie > 0 ? `、一样 ${h.tie} 道` : ""}
                            {h.aBrier !== null && h.bBrier !== null ? `（平均分 ${h.aBrier.toFixed(3)} 对 ${h.bBrier.toFixed(3)}）` : ""}
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {bins.map(({ s, bins: rows }) => (
                    <div key={s}>
                      <p className="mb-1 text-xs text-muted-foreground">{SOURCE_LABELS[s]} 说的和实际发生的</p>
                      <ul className="space-y-0.5 font-mono text-xs">
                        {rows.map((b) => (
                          <li key={b.lo}>
                            说 {Math.round(b.lo * 100)}–{Math.round(b.hi * 100)}% 的 {b.n} 道
                            {b.n > 0 && `，发生了 ${b.happened} 道`}
                            {b.n >= MIN_BIN && b.meanP !== null ? `（说的平均 ${pct(b.meanP)}，实际 ${pct(b.happened / b.n)}）` : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs leading-6 text-muted-foreground">
                  平均分是每道题（说的几成可能 − 结果）² 的平均，结果「会」算 1、「不会」算 0。永远说 50% 是 0.250 —— 比 0.250 小才算比瞎猜强。
                  分数和比率满 {MIN_SCORED} 道（每一格满 {MIN_BIN} 道）才显示，前面只数件数：几道题的准不准多半是运气。
                  这些数字只用于对世界事件的预测，不给想法打分。
                </p>
              </section>

              {compare && <CompareSection board={compare} kind="live" />}

              {open.length > 0 && (
                <section className="mb-10">
                  <h2 className="mb-3 text-base font-semibold">判断过、还没对账的（{open.length}）</h2>
                  <ul className="space-y-3">
                    {open.map((q) => (
                      <li key={q.id} className="border-b border-border pb-3 last:border-b-0">
                        <p className="text-sm font-medium">{q.title}</p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {KIND_LABELS[q.kind]} · {q.resolve_on} 截止{q.revealed_at && !has(q.id, "me") ? " · 你没判断、先看了答案" : ""}
                          {needsConfirm(q.kind) && q.pending ? " · 到期了，等出题的人确认" : ""}
                        </p>
                        <Answers q={q} forecasts={forecasts} calibration={calibration} />
                        {board.canConfirm && (canPublish(q) || q.source.manifold) && (
                          <PublishManifold questionId={q.id} url={q.source.manifold?.url} ready={manifoldReady} />
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {done.length > 0 && (
                <section>
                  <h2 className="mb-3 text-base font-semibold">对过账的（{done.length}）</h2>
                  <ul className="space-y-3">
                    {done.slice(0, 30).map((q) => (
                      <li key={q.id} className="border-b border-border pb-3 last:border-b-0">
                        <p className="text-sm font-medium">{q.title}</p>
                        <p className="text-xs">
                          <span className="font-medium">{q.status === "void" ? "作废（不算分）" : q.outcome ? "会（发生了）" : "不会（没发生）"}</span>
                          {q.resolution_note && <span className="ml-1 text-muted-foreground">—— {q.resolution_note}</span>}
                          {q.resolution_url && (
                            <a href={q.resolution_url} target="_blank" rel="noopener noreferrer" className="ml-1 text-primary underline-offset-4 hover:underline">
                              出处 ↗
                            </a>
                          )}
                        </p>
                        <Answers q={q} forecasts={forecasts} calibration={calibration} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          );
        })()
      )}
    </PageContainer>
  );
}
