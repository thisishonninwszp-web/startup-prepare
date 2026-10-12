import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { getSignalDetail } from "@/lib/domains/signals/analysis";
import { tokyoToday } from "@/lib/domains/signals/brief";
import type { SignalKind } from "@/lib/domains/signals/feeds";
import { formatReportDate, isReportDate } from "@/lib/domains/signals/format";
import { dueJudgments, knownTags, listJudgments, type JudgmentRow } from "@/lib/domains/signals/practice";
import { countPendingSignals, getDailyReport, type ReportSection } from "./queries";
import { GenerateBriefButton } from "./brief-panel";
import { ReaderPanel } from "./reader-panel";
import { JudgmentForm, ResolveJudgment } from "./judgment-forms";
import { formatDueDate, JudgmentView } from "./judgment-view";
import { HistoryPanel } from "./history-panel";
import { SourceCheckView } from "./check-view";

export const dynamic = "force-dynamic";
// 「现在生成」「写下判断」的 server action 跟着页面的时长上限走，默认 10 秒不够。
export const maxDuration = 60;

const SECTIONS: { kind: SignalKind; title: string; forYouLabel: string; empty: string }[] = [
  {
    kind: "news",
    title: "今天的世界",
    forYouLabel: "主要影响",
    empty: "今天的新闻报告还没生成。",
  },
  {
    kind: "calendar",
    title: "已经定了的未来",
    forYouLabel: "会影响谁",
    empty: "今天的日程还没整理。",
  },
  {
    kind: "voices",
    title: "谁在头疼什么",
    forYouLabel: "可以找谁聊",
    empty: "今天这一节还没整理。",
  },
  {
    kind: "tools",
    title: "今天的新工具",
    forYouLabel: "你可以试",
    empty: "今天的工具报告还没生成。",
  },
];

function ReportSectionView({
  section,
  data,
  isToday,
  hiddenSignalId,
}: {
  section: (typeof SECTIONS)[number];
  data: ReportSection | null;
  isToday: boolean;
  /** 今天的练习题还没写判断时，这一条的 AI 解读先藏起来。 */
  hiddenSignalId: string | null;
}) {
  return (
    <section className="mt-12">
      <h2 className="border-b pb-2 text-xl font-semibold">{section.title}</h2>

      {data && data.items.filter((i) => !i.extra).length === 0 ? (
        <div className="mt-4">
          {data.overview && <p className="text-base leading-8">{data.overview}</p>}
          <p className="mt-2 text-sm leading-7 text-muted-foreground">
            这一批消息里没有能放进这一节的。宁可空着，也不硬凑。
          </p>
        </div>
      ) : !data ? (
        <div className="mt-4 rounded-lg border border-dashed bg-dotgrid px-6 py-8 text-center">
          <p className="text-sm">{section.empty}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {isToday
              ? "每天早上 7 点会自动生成；现在想看就点下面，大约要十几秒。"
              : "那天没有生成这一份。"}
          </p>
          {isToday && (
            <div className="mt-4 flex justify-center">
              <GenerateBriefButton kind={section.kind} />
            </div>
          )}
        </div>
      ) : (
        <>
          {data.overview && <p className="mt-4 text-base leading-8">{data.overview}</p>}
          <ol className="mt-8 space-y-10">
            {data.items.filter((item) => !item.extra).map((item, i) => (
              <li key={item.signal_id}>
                <p className="font-mono text-xs text-muted-foreground">
                  {String(i + 1).padStart(2, "0")} · {item.source}
                </p>
                <h3 className="mt-1 text-lg font-semibold leading-8">
                  <Link
                    href={`/signals/${item.signal_id}`}
                    className="transition-colors duration-150 hover:text-primary"
                  >
                    {item.headline}
                  </Link>
                </h3>
                {item.signal_id === hiddenSignalId ? (
                  <p className="mt-2 rounded-md bg-muted/60 px-3 py-2 text-sm leading-7 text-muted-foreground">
                    这条是今天的练习题。先在上面写下你的判断，AI 的解读再出来。
                  </p>
                ) : (
                  <>
                    <p className="mt-2 text-base leading-8">{item.background}</p>
                    {item.grounded === true && item.basis && item.basis.length > 0 && (
                      <details className="mt-1 text-xs">
                        <summary className="cursor-pointer text-muted-foreground">按正文写的 · 看原文依据</summary>
                        <ul className="mt-1 space-y-1 border-l-2 border-border pl-3 leading-6 text-muted-foreground">
                          {item.basis.map((b, j) => (
                            <li key={j}>「{b}」</li>
                          ))}
                        </ul>
                      </details>
                    )}
                    {item.grounded === false && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        没读到正文，这段背景只根据标题和一两句简介写，具体数字和日期可能不准。点进去看原文。
                      </p>
                    )}
                    <p className="mt-3 text-sm leading-7">
                      <span className="text-muted-foreground">{section.forYouLabel}：</span>
                      {item.for_you}
                    </p>
                    {item.japan && (
                      <div className="mt-2 text-sm leading-7">
                        <p>
                          <span className="text-muted-foreground">日本这边：</span>
                          {item.japan}
                        </p>
                        <SourceCheckView
                          check={item.japan_check}
                          searchQuery={item.japan_query || `日本 ${item.headline}`}
                          unverifiedText="没查到出处，这句是 AI 凭印象说的。"
                          uncheckedText="这句是 AI 凭印象说的，没上网查过。"
                        />
                      </div>
                    )}
                    {item.personal && (
                      <p className="mt-2 border-l-2 border-primary pl-3 text-sm leading-7">
                        <span className="text-muted-foreground">跟你：</span>
                        {item.personal}
                      </p>
                    )}
                  </>
                )}
                <p className="mt-3 flex gap-4 text-sm">
                  <Link
                    href={`/signals/${item.signal_id}`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    看具体报告 →
                  </Link>
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline"
                    >
                      原文 ↗
                    </a>
                  )}
                </p>
              </li>
            ))}
          </ol>
          {data.items.some((item) => item.extra) && (
            <div className="mt-10 border-t pt-4">
              <h3 className="text-sm font-medium text-muted-foreground">还有这些也值得一看</h3>
              <ul className="mt-2 space-y-2">
                {data.items
                  .filter((item) => item.extra)
                  .map((item) => (
                    <li key={item.signal_id} className="text-sm leading-7">
                      <Link
                        href={`/signals/${item.signal_id}`}
                        className="transition-colors duration-150 hover:text-primary"
                      >
                        {item.headline}
                      </Link>
                      <span className="ml-2 font-mono text-xs text-muted-foreground">{item.source}</span>
                    </li>
                  ))}
              </ul>
            </div>
          )}
          {isToday && (
            <div className="mt-6 flex justify-end">
              <GenerateBriefButton kind={section.kind} regenerate />
            </div>
          )}
        </>
      )}
    </section>
  );
}

function DueJudgments({ rows }: { rows: JudgmentRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="mb-8 rounded-lg border border-primary/40 bg-card p-5">
      <h2 className="text-base font-semibold">到期了，对一下账（{rows.length}）</h2>
      <p className="mt-1 text-sm leading-7 text-muted-foreground">
        这些是你之前写下的判断。去看看现在实际怎样了，再回来标对错。
      </p>
      <ul className="mt-4 space-y-6">
        {rows.map((r) => (
          <li key={r.id}>
            <p className="text-sm text-muted-foreground">
              {formatDueDate(r.created_at)}读到：
              {r.news_url ? (
                <a
                  href={r.news_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline-offset-4 hover:underline"
                >
                  {r.news_title}
                </a>
              ) : (
                r.news_title
              )}
            </p>
            <p className="mt-1 border-l-2 border-primary pl-3 text-base font-medium leading-8">{r.judgment}</p>
            <ResolveJudgment predictionId={r.prediction_id} />
          </li>
        ))}
      </ul>
    </section>
  );
}

async function PracticeCard({
  practice,
  title,
  judgment,
  knownTags,
}: {
  practice: NonNullable<ReportSection["practice"]>;
  title: string;
  judgment: JudgmentRow | null;
  knownTags: string[];
}) {
  const detail = await getSignalDetail(practice.signal_id);
  const usable = detail && detail !== "missing-schema" ? detail : null;
  const summary = usable?.summary ?? "";
  return (
    <section className="mb-8 rounded-lg border bg-card p-5">
      <p className="font-mono text-xs text-muted-foreground">Today&apos;s practice</p>
      <h2 className="mt-1 text-lg font-semibold">今天的练习：先判断，再看答案</h2>
      <p className="mt-4 text-sm text-muted-foreground">读这一条：</p>
      <p className="mt-1 text-base font-medium leading-8">{title}</p>
      {summary && <p className="mt-1 text-sm leading-7">{summary}</p>}

      <div className="mt-5 border-t pt-5">
        {judgment ? (
          <>
            <JudgmentView judgment={judgment} />
            <p className="mt-4 text-sm leading-7 text-muted-foreground">到时候看什么：{practice.check_how}</p>
            <p className="mt-3 text-sm">
              <Link
                href={`/signals/${practice.signal_id}`}
                className="text-primary underline-offset-4 hover:underline"
              >
                看这条的具体报告 →
              </Link>
            </p>
          </>
        ) : (
          <>
            <div className="mb-5">
              <p className="mb-2 text-sm leading-7 text-muted-foreground">
                写判断前，推荐先看看这类事过去通常怎样。看完再想「这次有什么不同」。
              </p>
              <HistoryPanel signalId={practice.signal_id} initial={usable?.history ?? null} />
            </div>
            <JudgmentForm signalId={practice.signal_id} question={practice.question} knownTags={knownTags} />
          </>
        )}
        {judgment && (
          <div className="mt-6 border-t pt-5">
            <HistoryPanel
              signalId={practice.signal_id}
              initial={usable?.history ?? null}
              label="看历史上类似的事"
            />
          </div>
        )}
      </div>
    </section>
  );
}

export default async function SignalsReportPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const today = tokyoToday();
  const date = isReportDate(searchParams.date) ? searchParams.date : today;
  const isToday = date === today;
  const [report, newsCount, toolsCount, judgments] = await Promise.all([
    getDailyReport(user.id, date),
    countPendingSignals("news"),
    countPendingSignals("tools"),
    // 迁移 055 没跑时练习整块不显示，报告照常
    listJudgments(user.id).catch((e: Error) => {
      if (/signal_judgments/.test(e.message)) return null;
      throw e;
    }),
  ]);

  const practice = report !== "missing-schema" ? report.news?.practice ?? null : null;
  const practiceItem =
    practice && report !== "missing-schema"
      ? report.news?.items.find((i) => i.signal_id === practice.signal_id) ?? null
      : null;
  const practiceJudgment =
    practice && judgments ? judgments.find((j) => j.signal_id === practice.signal_id) ?? null : null;
  const hiddenSignalId = practice && judgments && !practiceJudgment ? practice.signal_id : null;

  return (
    <PageContainer width="narrow">
      <PageHeader
        eyebrow={`Daily report · ${date}`}
        title={isToday ? "今日报告" : `${formatReportDate(date)}的报告`}
        description="每天先做一道练习：读一条新闻，写下你的判断，再看 AI 怎么拆。下面是今天的世界、已经定了的未来、一线的人在头疼什么，还有新工具。"
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/signals/practice">判断账本</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/signals/gaps">中国有、日本还没有</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/signals/questions">我在追的问题</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/signals/inbox">全部新闻 {newsCount}</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/signals/inbox?tab=tools">全部工具 {toolsCount}</Link>
            </Button>
          </>
        }
      />

      {report === "missing-schema" ? (
        <div className="rounded-lg border border-status-validating/30 bg-status-validating/10 p-5 text-sm leading-7 text-status-validating">
          数据库还差一步：迁移 053 或 054 没跑。到 Supabase 的 SQL Editor 执行
          supabase/migrations/054_signal_reports.sql 之后再来。
        </div>
      ) : (
        <>
          {report.recentDates.length > 1 && (
            <nav className="mb-6 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <span className="text-muted-foreground">往期：</span>
              {report.recentDates.map((d) => (
                <Link
                  key={d}
                  href={d === today ? "/signals" : `/signals?date=${d}`}
                  className={
                    d === date
                      ? "font-medium text-primary"
                      : "text-muted-foreground transition-colors duration-150 hover:text-foreground"
                  }
                >
                  {formatReportDate(d)}
                </Link>
              ))}
            </nav>
          )}

          {isToday && <ReaderPanel userId={user.id} />}

          {judgments === null ? (
            <div className="mb-8 rounded-lg border border-status-validating/30 bg-status-validating/10 p-4 text-sm leading-7 text-status-validating">
              「先判断，再看答案」的练习还差一步：迁移 055 没跑。执行
              supabase/migrations/055_signal_judgments.sql 之后，这里会出现每天的练习题。
            </div>
          ) : (
            <>
              {isToday && <DueJudgments rows={dueJudgments(judgments)} />}
              {practice && practiceItem && (
                <PracticeCard
                  practice={practice}
                  title={practiceItem.title}
                  judgment={practiceJudgment}
                  knownTags={knownTags(judgments)}
                />
              )}
              {isToday && report.news && !practice && (
                <p className="mb-8 text-sm leading-7 text-muted-foreground">
                  今天这份报告是在练习功能上线前生成的，没有练习题。点「今天的世界」下面的「重新生成这一份」就会有。
                </p>
              )}
            </>
          )}

          {SECTIONS.map((section) => (
            <ReportSectionView
              key={section.kind}
              section={section}
              data={report[section.kind]}
              isToday={isToday}
              hiddenSignalId={section.kind === "news" ? hiddenSignalId : null}
            />
          ))}
        </>
      )}
    </PageContainer>
  );
}
