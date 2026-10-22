import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { tokyoToday } from "@/lib/domains/signals/brief";
import {
  calibrationBins,
  daysBetween,
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
import { Answers, ConfirmCard, ForecastCard } from "./forecast-cards";

export const dynamic = "force-dynamic";

const PAIRS: [ForecastSource, ForecastSource][] = [
  ["me", "ai"],
  ["ai", "market"],
  ["me", "market"],
];

export default async function ForecastPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const today = tokyoToday();
  const board = await loadForecastBoard(user.id);

  return (
    <PageContainer width="narrow">
      <PageHeader
        eyebrow="Forecasts"
        title="预测"
        description="每天进几道能对账的题：预测市场上的（到期平台自己结算，还带着市场的概率当对照）、从今天新闻里出的生意题（到期程序查证据，你点确认）。你先押，AI 用三种思路各押一个取中间。对账多了，就看得出你、AI、市场谁更准，准在哪类题上。"
      />

      {board === "missing-schema" ? (
        <p className="text-sm leading-7 text-muted-foreground">
          还差一步：迁移 091 没跑。执行 supabase/migrations/091_signal_memory_forecasts.sql 之后，题目每天早上 7:30 和晚上 7 点由后台进来。
        </p>
      ) : (
        (() => {
          const { questions, forecasts } = board;
          const has = (qid: string, s: ForecastSource) => forecasts.some((f) => f.question_id === qid && f.source === s);
          const toForecast = questions.filter((q) => q.status === "open" && !q.revealed_at && !has(q.id, "me") && daysBetween(today, q.resolve_on) > 0);
          const toConfirm = questions.filter((q) => q.status === "open" && q.kind === "business" && q.pending);
          const open = questions.filter((q) => q.status === "open" && (q.revealed_at || has(q.id, "me")) && !(q.kind === "business" && q.pending));
          const done = questions.filter((q) => q.status !== "open").sort((a, b) => (b.resolved_at ?? "").localeCompare(a.resolved_at ?? ""));
          const scores = scoreBySource(questions, forecasts, ["me", "ai", "market", "ai_outside", "ai_inside", "ai_devil"]);
          const bins = (["ai", "me"] as ForecastSource[]).map((s) => ({ s, bins: calibrationBins(questions, forecasts, s) }));

          if (questions.length === 0) {
            return (
              <p className="text-sm leading-7 text-muted-foreground">
                这里空着。题目每天早上 7:30 和晚上 7 点由后台进来（GitHub 上的定时任务调用这个网站；要在 GitHub 仓库的 Settings → Secrets 里加一个
                CRON_SECRET，值和 Vercel 里的一样）。也可以在 GitHub 的 Actions 页面手动点一次「signals-jobs」。
              </p>
            );
          }

          return (
            <>
              <section className="mb-10">
                <h2 className="mb-3 text-base font-semibold">等你押（{toForecast.length}）</h2>
                {toForecast.length === 0 ? (
                  <p className="text-sm text-muted-foreground">这会儿没有等你押的题。新题每天早上和晚上进来。</p>
                ) : (
                  <ul className="space-y-4">
                    {toForecast.map((q) => (
                      <ForecastCard key={q.id} q={q} />
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-xs leading-6 text-muted-foreground">
                  先押、再看 AI 和市场 —— 先看了再押，押的就是它们的数，账本就不是你的了。押了不能改：改了就没法知道你当时准不准。
                </p>
              </section>

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
                          "还没有两边都押过、又对过账的题"
                        ) : (
                          <>
                            两边都押过的 {h.n} 道里，{SOURCE_LABELS[a]}更近 {h.aBetter} 道、{SOURCE_LABELS[b]}更近 {h.bBetter} 道
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
                  平均分是每道题（押的概率 − 结果）² 的平均，结果「会」算 1、「不会」算 0。永远押 50% 是 0.250 —— 比 0.250 小才算比瞎猜强。
                  分数和比率满 {MIN_SCORED} 道（每一格满 {MIN_BIN} 道）才显示，前面只数件数：几道题的准不准多半是运气。
                  这些数字只用于对世界事件的预测，不给想法打分。
                </p>
              </section>

              {open.length > 0 && (
                <section className="mb-10">
                  <h2 className="mb-3 text-base font-semibold">押过、还没到期的（{open.length}）</h2>
                  <ul className="space-y-3">
                    {open.map((q) => (
                      <li key={q.id} className="border-b border-border pb-3 last:border-b-0">
                        <p className="text-sm font-medium">{q.title}</p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {KIND_LABELS[q.kind]} · {q.resolve_on} 截止{q.revealed_at && !has(q.id, "me") ? " · 你没押、先看了答案" : ""}
                        </p>
                        <Answers q={q} forecasts={forecasts} />
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
                        <Answers q={q} forecasts={forecasts} />
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
