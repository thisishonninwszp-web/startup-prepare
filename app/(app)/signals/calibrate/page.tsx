import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { tokyoToday } from "@/lib/domains/signals/brief";
import { BIN_MIN, CALIBRATION_MIN, describePlatt, SCORE_MIN, type Bin } from "@/lib/domains/signals/calibration-shared";
import { pct } from "@/lib/domains/signals/forecast-shared";
import { DAILY_DRILL, HISTORY_TARGET } from "@/lib/domains/signals/history-shared";
import { drillProgress, historyBacktest, nextDrillQuestion } from "@/lib/domains/signals/backtest";
import { DrillCard } from "./drill-card";

export const dynamic = "force-dynamic";

const f3 = (x: number) => x.toFixed(3);

function Bins({ title, bins }: { title: string; bins: Bin[] }) {
  return (
    <div>
      <p className="mb-1 text-xs text-muted-foreground">{title}</p>
      <ul className="space-y-0.5 font-mono text-xs">
        {bins.map((b) => (
          <li key={b.lo}>
            说 {Math.round(b.lo * 100)}–{Math.round(b.hi * 100)}% 的 {b.n} 道
            {b.n > 0 && `，发生了 ${b.happened} 道`}
            {b.n >= BIN_MIN && b.meanP !== null ? `（说的平均 ${pct(b.meanP)}，实际 ${pct(b.happened / b.n)}）` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function CalibratePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const today = tokyoToday();
  const [question, progress, report] = await Promise.all([nextDrillQuestion(user.id), drillProgress(user.id, today), historyBacktest().catch(() => null)]);

  return (
    <PageContainer width="narrow">
      <PageHeader
        eyebrow="Calibration"
        title="校准练习"
        description="预测市场上已经结算的题（2025 年 3 月以后开的：AI 不知道答案，你多半也不记得）。假装今天是那一天，先想这一类事一般几成会发生，再想这件事几成，点了马上揭晓 —— 跟那天市场说的、AI 当时说的放在一起。每天 10 道，两分钟；有即时反馈的练习是让判断变准最快的路。"
      />

      {question === "missing-schema" || progress === "missing-schema" ? (
        <p className="text-sm leading-7 text-muted-foreground">
          还差一步：迁移 094 没跑。执行 supabase/migrations/094_forecast_history.sql 之后，后台每 3 小时攒一批题（GitHub 的 signals-history 任务，也能在 Actions 页面手动点一次）。
        </p>
      ) : (
        <>
          <p className="mb-4 font-mono text-xs text-muted-foreground">
            今天 {progress.today} / {DAILY_DRILL}
            {progress.today >= DAILY_DRILL ? "（今天的做完了，想多练可以接着做）" : ""} · 做过 {progress.stats.n + progress.stats.knew} 道 · 题库 {progress.ready} 道
            {progress.ready < HISTORY_TARGET ? `（还在攒，目标 ${HISTORY_TARGET}）` : ""}
          </p>

          {question ? (
            <DrillCard key={question.id} q={question} />
          ) : (
            <p className="text-sm leading-7 text-muted-foreground">
              {progress.ready === 0 ? "题库还空着：后台每 3 小时攒一批（一道要先查那天的价格和新闻，再让 AI 当时判断一次）。" : "题库里的都做完了。新题每 3 小时进来一批。"}
            </p>
          )}

          <section className="mt-10">
            <h2 className="mb-2 text-base font-semibold">你的成绩</h2>
            {progress.stats.n < SCORE_MIN ? (
              <p className="text-sm leading-7 text-muted-foreground">
                计分的题满 {SCORE_MIN} 道才给分（现在 {progress.stats.n} 道）：几道题的准不准多半是运气。
              </p>
            ) : (
              <>
                <ul className="space-y-1 text-sm leading-7">
                  <li>
                    你的平均分 <span className="font-mono">{progress.stats.you !== null ? f3(progress.stats.you) : "—"}</span>
                    {progress.stats.market !== null && (
                      <>
                        ，同一批题上那天的市场 <span className="font-mono">{f3(progress.stats.market)}</span>
                      </>
                    )}
                    {progress.stats.ai !== null && (
                      <>
                        ，AI <span className="font-mono">{f3(progress.stats.ai)}</span>
                      </>
                    )}
                    <span className="text-muted-foreground">（越小越准；永远说五成是 0.250）</span>
                  </li>
                  {progress.stats.baseOnly && (
                    <li>
                      先写了基准率的 {progress.stats.baseOnly.n} 道：只按基准率的话 <span className="font-mono">{f3(progress.stats.baseOnly.base)}</span>，你看了这件事调整以后{" "}
                      <span className="font-mono">{f3(progress.stats.baseOnly.adjusted)}</span>
                      <span className="text-muted-foreground">
                        {progress.stats.baseOnly.adjusted < progress.stats.baseOnly.base ? "（调整让你更准）" : "（调整反而让你更不准：多信一点基准率）"}
                      </span>
                    </li>
                  )}
                </ul>
                <div className="mt-3">
                  <Bins title="你说的和实际发生的" bins={progress.stats.bins} />
                </div>
              </>
            )}
            {progress.stats.knew > 0 && <p className="mt-2 text-xs text-muted-foreground">记得结果、不计分的 {progress.stats.knew} 道。</p>}
          </section>

          <section className="mt-10">
            <h2 className="mb-2 text-base font-semibold">AI 的回测</h2>
            {!report || report.n < SCORE_MIN ? (
              <p className="text-sm leading-7 text-muted-foreground">题库满 {SCORE_MIN} 道才算（现在 {report?.n ?? 0} 道）。</p>
            ) : (
              <>
                <p className="text-sm leading-7">
                  {report.n} 道历史题上，AI（三种思路取中间、只看那天以前的新闻）平均分 <span className="font-mono">{f3(report.aiBrier)}</span>
                  {report.marketBrier !== null && (
                    <>
                      ，那天的市场 <span className="font-mono">{f3(report.marketBrier)}</span>
                    </>
                  )}
                  ，永远说「这批题里会的比例」<span className="font-mono">{f3(report.baseBrier)}</span>。
                  {report.marketBrier !== null &&
                    (report.aiBrier > report.marketBrier ? " AI 不如市场：有市场的题，听市场的。" : " AI 不比市场差。")}
                </p>
                {report.suspicious && (
                  <p className="mt-2 rounded-md border border-status-validating/30 bg-status-validating/10 p-3 text-xs leading-6 text-status-validating">
                    AI 比当时的市场准太多了 —— 它可能见过答案（知识没停在说的那天）。这一份回测先别当真。
                  </p>
                )}
                {report.platt ? (
                  <p className="mt-2 text-sm leading-7">
                    学到的校准：{describePlatt(report.platt)}。在没给它学过的题上（五折交叉验证），校准后平均分{" "}
                    <span className="font-mono">{report.calibratedBrier !== null ? f3(report.calibratedBrier) : "—"}</span>
                    {report.calibratedBrier !== null && report.calibratedBrier < report.aiBrier
                      ? "，比原来准 —— 预测页上 AI 的数会同时显示校准后的。"
                      : "，没比原来准，先不用。"}
                    {report.combo && (
                      <>
                        {" "}
                        AI 和市场合成：市场的分量 {report.combo.wMarket.toFixed(2)}、AI {report.combo.wAi.toFixed(2)}，合成后 <span className="font-mono">{f3(report.combo.brier)}</span>。
                      </>
                    )}
                  </p>
                ) : (
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">满 {CALIBRATION_MIN} 道才学校准（现在 {report.n} 道）。</p>
                )}
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Bins title="AI 说的和实际发生的" bins={report.aiBins} />
                  <Bins title="那天市场说的和实际发生的" bins={report.marketBins} />
                </div>
                <p className="mt-3 text-xs leading-6 text-muted-foreground">
                  回测里的 AI 不上网（上网会搜到答案），只看那天以前 30 天的新闻标题（GDELT）；线上预测题里的 AI 会上网查，两者不完全一样，线上的题照样各自对账。
                </p>
              </>
            )}
          </section>

          <p className="mt-10 text-xs leading-6 text-muted-foreground">
            平均分是每道题（说的几成 − 结果）² 的平均，结果「会」算 1、「不会」算 0。分数满 {SCORE_MIN} 道、每一格满 {BIN_MIN} 道才显示。这些数字只用于对世界事件的预测，不给想法打分。
            <Link href="/signals/forecast" className="ml-1 underline-offset-4 hover:underline">
              回预测题
            </Link>
          </p>
        </>
      )}
    </PageContainer>
  );
}
