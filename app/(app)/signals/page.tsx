import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { getSignalDetail } from "@/lib/domains/signals/analysis";
import { tokyoToday } from "@/lib/domains/signals/brief";
import type { BriefItem } from "@/lib/domains/signals/brief";
import { getDigest, type Digest } from "@/lib/domains/signals/digest";
import type { SignalKind } from "@/lib/domains/signals/feeds";
import type { EarlierMention } from "@/lib/domains/signals/followups";
import { formatReportDate, isReportDate } from "@/lib/domains/signals/format";
import { emailConfig } from "@/lib/domains/signals/notify";
import { dueJudgments, knownTags, listJudgments, type JudgmentRow } from "@/lib/domains/signals/practice";
import { countPendingSignals, getDailyReport, type ReportSection } from "./queries";
import { GenerateBriefButton } from "./brief-panel";
import { SourceCheckView } from "./check-view";
import { DigestLoader } from "./digest-loader";
import { EmailPanel } from "./email-panel";
import { HistoryPanel } from "./history-panel";
import { JudgmentForm, ResolveJudgment } from "./judgment-forms";
import { formatDueDate, JudgmentView } from "./judgment-view";
import { ListenButton } from "./listen-button";
import { ReaderPanel } from "./reader-panel";
import { SectionTabs } from "./section-tabs";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";
// 「现在生成」「写下判断」的 server action 跟着页面的时长上限走，默认 10 秒不够。
export const maxDuration = 60;

/**
 * 每日报告页，从上到下：今日总览 → 到期的判断 → 今天的练习 → 五节（页签，一次看一节）。
 * 每条新闻默认只显示一行标题和几个小标签（意外、先例、跟你……），点开才展开背景和分析；
 * 展开后，日本这边、中国那边、先例、机会来源、原文依据再收在"更多"里 —— 内容不删，只是不全摊开。
 */

const SECTIONS: { kind: SignalKind; title: string; tab: string; forYouLabel: string; empty: string }[] = [
  { kind: "news", title: "今天的世界", tab: "世界", forYouLabel: "主要影响", empty: "今天的新闻报告还没生成。" },
  { kind: "calendar", title: "已经定了的未来", tab: "定了的未来", forYouLabel: "会影响谁", empty: "今天的日程还没整理。" },
  { kind: "voices", title: "谁在头疼什么", tab: "头疼", forYouLabel: "可以找谁聊", empty: "今天这一节还没整理。" },
  { kind: "money", title: "谁在掏钱", tab: "掏钱", forYouLabel: "钱流向哪里", empty: "今天这一节还没整理。" },
  { kind: "tools", title: "新工具和新可能", tab: "新工具", forYouLabel: "多了什么选项", empty: "今天的工具报告还没生成。" },
];

/** 德鲁克七个来源的叫法（"意外"单独显示，不在这里）。 */
const OPPORTUNITY_LABELS: Record<NonNullable<BriefItem["opportunity"]>, string> = {
  incongruity: "不协调（现实和大家以为的不一样）",
  process: "流程上的需要（某个环节卡住了）",
  structure: "行业结构在变",
  demographics: "人口在变",
  perception: "观念在变",
  knowledge: "新知识、新技术",
};

/** 去别的页面的入口，收成一行文字。 */
const LINKS: { href: string; label: string }[] = [
  { href: "/signals/practice", label: "判断账本" },
  { href: "/signals/questions", label: "我在追的问题" },
  { href: "/signals/gaps", label: "中国⇄日本" },
  { href: "/signals/precedents", label: "先例" },
  { href: "/signals/slow", label: "慢变量" },
];

/** 这件事之前也上过报告：哪天、那次的标题；那次写过判断的话，把判断和对账情况摆出来。 */
function EarlierLine({ mention }: { mention: EarlierMention }) {
  const j = mention.judgment;
  return (
    <div className="mt-2 rounded-md bg-muted/50 px-3 py-2 text-sm leading-7">
      <p>
        <span className="text-muted-foreground">
          这件事{mention.times > 1 ? `之前上过 ${mention.times} 次报告，最近一次是` : "之前上过报告："}
          {formatReportDate(mention.brief_date)}
        </span>
        <Link
          href={`/signals/${mention.signal_id}`}
          className="ml-1 underline-offset-4 transition-colors duration-150 hover:text-primary hover:underline"
        >
          「{mention.headline}」
        </Link>
      </p>
      {j && (
        <p>
          <span className="text-muted-foreground">{formatReportDate(j.brief_date)}那次你判断：</span>
          {j.judgment}
          <span className="ml-1 font-mono text-xs text-muted-foreground">
            {j.outcome === "pending" ? `· ${formatDueDate(j.due_at)}对账` : j.outcome === "hit" ? "· 看对了" : "· 看错了"}
          </span>
          {j.outcome === "pending" && (
            <span className="block text-xs text-muted-foreground">今天这条，是在朝你判断的方向走，还是反过来？</span>
          )}
        </p>
      )}
    </div>
  );
}

/** "日本这边"或"中国那边"的一段：结论、有没有人拿到钱、核实结果。 */
function SideBlock({
  label,
  text,
  funded,
  check,
  searchQuery,
}: {
  label: string;
  text: string;
  funded?: BriefItem["japan_funded"];
  check?: BriefItem["japan_check"];
  searchQuery: string;
}) {
  return (
    <div>
      <p>
        <span className="text-muted-foreground">{label}：</span>
        {text}
      </p>
      {funded && (
        <p className="text-xs text-muted-foreground">
          {label.slice(0, 2)}已经有人拿到钱在做：{funded.company}
          <a href={funded.url} target="_blank" rel="noopener noreferrer" className="ml-1 text-primary underline-offset-4 hover:underline">
            原文 ↗
          </a>
        </p>
      )}
      <SourceCheckView
        check={check}
        searchQuery={searchQuery}
        unverifiedText="没查到出处，这句是 AI 凭印象说的。"
        uncheckedText="这句是 AI 凭印象说的，没上网查过。"
      />
    </div>
  );
}

/** 一条新闻。 */
function ReportItem({
  item,
  n,
  forYouLabel,
  hidden,
  earlier,
}: {
  item: BriefItem;
  n: number;
  forYouLabel: string;
  hidden: boolean;
  earlier?: EarlierMention;
}) {
  // 中国那边只在"没有、没普及"时显示：中国早就有的（比如豆芽）只是噪音
  const showChina = !!item.china_side && /^(没有|有类似的)/.test(item.china_side);
  const more = [
    item.japan ? "日本这边" : null,
    showChina ? "中国那边" : null,
    item.precedent ? "先例" : null,
    item.opportunity ? "机会来源" : null,
    item.grounded && item.basis && item.basis.length > 0 ? "原文依据" : null,
  ].filter((x): x is string => !!x);

  // 标题行上的小标签：扫一眼就知道哪几条值得点开
  const chips = [
    hidden ? "练习题" : null,
    item.surprise ? "意外" : null,
    item.related_question ? "你在追的问题" : null,
    item.personal ? (item.personal_edge ? "你的优势" : "跟你") : null,
    earlier ? "之前上过" : null,
    item.precedent ? "先例" : null,
    showChina || (item.japan && /^(没有|有类似的)/.test(item.japan)) ? "中日差距" : null,
  ].filter((x): x is string => !!x);

  return (
    <li>
      <details id={`item-${item.signal_id}`} className="group scroll-mt-16">
        <summary className="flex cursor-pointer list-none gap-3 py-3 transition-colors duration-150 hover:text-primary">
          <span className="mt-0.5 font-mono text-xs text-muted-foreground">{String(n).padStart(2, "0")}</span>
          <span className="min-w-0 flex-1">
            <span className="text-base font-medium leading-7">{item.headline}</span>
            {chips.length > 0 && (
              <span className="mt-1 flex flex-wrap gap-1">
                {chips.map((c) => (
                  <Badge key={c} variant={c === "意外" || c === "你的优势" || c === "你在追的问题" ? "default" : "muted"}>
                    {c}
                  </Badge>
                ))}
              </span>
            )}
          </span>
          <span className="mt-1 text-xs text-muted-foreground group-open:hidden">展开</span>
          <span className="mt-1 hidden text-xs text-muted-foreground group-open:inline">收起</span>
        </summary>
        <div className="pb-4 pl-7">
          <p className="font-mono text-xs text-muted-foreground">{item.source}</p>
          {hidden ? (
            <p className="mt-2 rounded-md bg-muted/60 px-3 py-2 text-sm leading-7 text-muted-foreground">
              这条是今天的练习题。先在上面写下你的判断，AI 的解读再出来。
            </p>
          ) : (
            <>
              <p className="mt-2 text-base leading-8">{item.background}</p>
              {item.grounded === false && (
                <p className="mt-1 text-xs text-muted-foreground">
                  没读到正文，这段背景只根据标题和一两句简介写，具体数字和日期可能不准。
                </p>
              )}
              <p className="mt-2 text-sm leading-7">
                <span className="text-muted-foreground">{forYouLabel}：</span>
                {item.for_you}
              </p>

              {/* 要人停下来的几样，默认露出来 */}
              {item.surprise && (
                <div className="mt-2 border-l-2 border-primary pl-3 text-sm leading-7">
                  <p>
                    <span className="font-medium text-primary">意外：</span>
                    原本以为{item.surprise.expected.replace(/^(原本|大家)?(以为|预期)/, "")}，结果
                    {item.surprise.actual.replace(/^结果/, "")}。为什么？
                  </p>
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">原文</summary>
                    <p className="mt-1 text-muted-foreground">「{item.surprise.quote}」</p>
                  </details>
                </div>
              )}
              {earlier && <EarlierLine mention={earlier} />}
              {item.related_question && (
                <p className="mt-2 border-l-2 border-primary pl-3 text-sm leading-7">
                  <span className="text-muted-foreground">跟你在追的问题有关：</span>
                  <Link
                    href={`/signals/questions/${item.related_question.id}`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {item.related_question.question} →
                  </Link>
                  <span className="block">{item.related_question.why}</span>
                </p>
              )}
              {item.personal && (
                <p className="mt-2 border-l-2 border-primary pl-3 text-sm leading-7">
                  <span className="text-muted-foreground">{item.personal_edge ? "你的优势：" : "跟你："}</span>
                  {item.personal}
                </p>
              )}

              {/* 其余的分析收起来 */}
              {more.length > 0 && (
                <details className="mt-2 text-sm leading-7">
                  <summary className="cursor-pointer text-muted-foreground">更多：{more.join("、")}</summary>
                  <div className="mt-2 space-y-3 border-l-2 border-border pl-3">
                    {item.japan && (
                      <SideBlock
                        label="日本这边"
                        text={item.japan}
                        funded={item.japan_funded}
                        check={item.japan_check}
                        searchQuery={item.japan_query || `日本 ${item.headline}`}
                      />
                    )}
                    {showChina && (
                      <SideBlock
                        label="中国那边"
                        text={item.china_side!}
                        funded={item.china_funded}
                        check={item.china_check}
                        searchQuery={item.china_query || `中国 ${item.headline}`}
                      />
                    )}
                    {item.precedent && (
                      <p>
                        <span className="text-muted-foreground">先例：</span>
                        {item.precedent}
                      </p>
                    )}
                    {item.opportunity && (
                      <p className="font-mono text-xs text-muted-foreground">机会来源 · {OPPORTUNITY_LABELS[item.opportunity]}</p>
                    )}
                    {item.grounded && item.basis && item.basis.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        <p>背景是读了正文写的，依据：</p>
                        <ul className="mt-1 space-y-1">
                          {item.basis.map((b, j) => (
                            <li key={j}>「{b}」</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </details>
              )}
            </>
          )}
          <p className="mt-2 flex gap-4 text-sm">
            <Link href={`/signals/${item.signal_id}`} className="text-primary underline-offset-4 hover:underline">
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
        </div>
      </details>
    </li>
  );
}

function ReportSectionView({
  section,
  data,
  isToday,
  hiddenSignalId,
  earlier,
}: {
  section: (typeof SECTIONS)[number];
  data: ReportSection | null;
  isToday: boolean;
  /** 之前的报告也出现过同一件事的条目。 */
  earlier: Record<string, EarlierMention>;
  /** 今天的练习题还没写判断时，这一条的 AI 解读先藏起来。 */
  hiddenSignalId: string | null;
}) {
  const picks = (data?.items ?? []).filter((i) => !i.extra);
  // 新工具和新可能分成两组：GitHub 仓库一组，降价、规制缓和、日本首次提供一组
  const groups =
    section.kind === "tools"
      ? [
          { label: "GitHub 新工具", items: picks.filter((i) => i.source === "GitHub 新仓库") },
          { label: "新可能：降价、规制缓和、日本首次提供", items: picks.filter((i) => i.source !== "GitHub 新仓库") },
        ].filter((g) => g.items.length > 0)
      : [{ label: null as string | null, items: picks }];

  return (
    <section id={`section-${section.kind}`} className="mt-4">
      <h2 className="text-lg font-semibold">{section.title}</h2>

      {data && picks.length === 0 ? (
        <div className="mt-4">
          {data.overview && <p className="text-base leading-8">{data.overview}</p>}
          <p className="mt-2 text-sm leading-7 text-muted-foreground">这一批消息里没有能放进这一节的。宁可空着，也不硬凑。</p>
        </div>
      ) : !data ? (
        <div className="mt-4 rounded-lg border border-dashed bg-dotgrid px-6 py-8 text-center">
          <p className="text-sm">{section.empty}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {isToday ? "每天早上会自动生成；现在想看就点下面，大约要十几秒。" : "那天没有生成这一份。"}
          </p>
          {isToday && (
            <div className="mt-4 flex justify-center">
              <GenerateBriefButton kind={section.kind} />
            </div>
          )}
        </div>
      ) : (
        <>
          {data.overview && <p className="mt-2 text-sm leading-7 text-muted-foreground">{data.overview}</p>}
          {groups.map((g, gi) => {
            const offset = groups.slice(0, gi).reduce((n, x) => n + x.items.length, 0);
            return (
              <div key={g.label ?? "all"}>
                {g.label && <h3 className="mt-6 text-sm font-medium text-muted-foreground">{g.label}</h3>}
                <ol className="mt-3 divide-y border-y">
                  {g.items.map((item, i) => (
                    <ReportItem
                      key={item.signal_id}
                      item={item}
                      n={offset + i + 1}
                      forYouLabel={section.forYouLabel}
                      hidden={item.signal_id === hiddenSignalId}
                      earlier={earlier[item.signal_id]}
                    />
                  ))}
                </ol>
              </div>
            );
          })}
          {data.items.some((item) => item.extra) && (
            <details className="mt-6">
              <summary className="cursor-pointer text-sm text-muted-foreground">
                还有 {data.items.filter((item) => item.extra).length} 条也值得一看
              </summary>
              <ul className="mt-2 space-y-2">
                {data.items
                  .filter((item) => item.extra)
                  .map((item) => (
                    <li key={item.signal_id} className="text-sm leading-7">
                      <Link href={`/signals/${item.signal_id}`} className="transition-colors duration-150 hover:text-primary">
                        {item.headline}
                      </Link>
                      <span className="ml-2 font-mono text-xs text-muted-foreground">{item.source}</span>
                    </li>
                  ))}
              </ul>
            </details>
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

/** 今日总览：像一个懂行的人看完五节，跟你讲几句今天世界上发生了什么。 */
function DigestCard({ digest, date, canGenerate }: { digest: Digest | null; date: string; canGenerate: boolean }) {
  return (
    <section className="mb-8 rounded-lg border bg-card p-5">
      <h2 className="text-lg font-semibold">今日总览</h2>
      {digest ? (
        <>
          <p className="mt-3 text-base leading-8">{digest.summary}</p>
          {digest.picks.length > 0 && (
            <div className="mt-4 border-t pt-3">
              <p className="text-sm text-muted-foreground">最值得点开的：</p>
              <ul className="mt-1 space-y-2 text-sm leading-7">
                {digest.picks.map((p) => (
                  <li key={p.signal_id}>
                    <a href={`#item-${p.signal_id}`} className="font-medium underline-offset-4 transition-colors duration-150 hover:text-primary hover:underline">
                      {p.headline}
                    </a>
                    <span className="block text-muted-foreground">{p.why}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : canGenerate ? (
        <div className="mt-3">
          <DigestLoader date={date} />
        </div>
      ) : (
        <p className="mt-3 text-sm leading-7 text-muted-foreground">今天的报告还没生成，总览要等下面几节出来再写。</p>
      )}
    </section>
  );
}

function DueJudgments({ rows }: { rows: JudgmentRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="mb-8 rounded-lg border border-primary/40 bg-card p-5">
      <h2 className="text-base font-semibold">到期了，对一下账（{rows.length}）</h2>
      <p className="mt-1 text-sm leading-7 text-muted-foreground">这些是你之前写下的判断。去看看现在实际怎样了，再回来标对错。</p>
      <ul className="mt-4 space-y-6">
        {rows.map((r) => (
          <li key={r.id}>
            <p className="text-sm text-muted-foreground">
              {formatDueDate(r.created_at)}读到：
              {r.news_url ? (
                <a href={r.news_url} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">
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
  position,
  judgment,
  knownTags,
}: {
  practice: NonNullable<ReportSection["practice"]>;
  title: string;
  /** 这道题出自"今天的世界"第几条。 */
  position: number;
  judgment: JudgmentRow | null;
  knownTags: string[];
}) {
  const detail = await getSignalDetail(practice.signal_id);
  const usable = detail && detail !== "missing-schema" ? detail : null;
  const summary = usable?.summary ?? "";
  return (
    <section className="mb-8 rounded-lg border bg-card p-5">
      <h2 className="text-lg font-semibold">今天的练习：先判断，再看答案</h2>
      <p className="mt-3 border-l-2 border-primary pl-3 text-base font-medium leading-8">{practice.question}</p>
      <p className="mt-2 text-xs leading-6 text-muted-foreground">
        出自
        <a href={`#item-${practice.signal_id}`} className="mx-1 text-primary underline-offset-4 hover:underline">
          「今天的世界」第 {position} 条
        </a>
        。从今天的世界里挑一件重要、又可能往两个方向走的事出题，已经定了的事不出题。
      </p>
      {practice.why_uncertain && (
        <p className="mt-2 text-sm leading-7">
          <span className="text-muted-foreground">为什么选这条：</span>
          {practice.why_uncertain}
        </p>
      )}

      {judgment ? (
        <>
          <p className="mt-4 text-sm leading-7">
            <span className="text-muted-foreground">你写了：</span>
            {judgment.judgment}
            <span className="ml-1 font-mono text-xs text-muted-foreground">· {formatDueDate(judgment.due_at)}对账</span>
          </p>
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-muted-foreground">看 AI 怎么拆、到时候看什么</summary>
            <div className="mt-3">
              <JudgmentView judgment={judgment} showQuestion={false} />
              <p className="mt-4 leading-7 text-muted-foreground">到时候看什么：{practice.check_how}</p>
              <div className="mt-5 border-t pt-4">
                <HistoryPanel signalId={practice.signal_id} initial={usable?.history ?? null} label="看历史上类似的事" />
              </div>
            </div>
          </details>
        </>
      ) : (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-primary">开始写判断 →</summary>
          <div className="mt-4 space-y-5">
            <div>
              <p className="text-sm text-muted-foreground">读这一条：</p>
              <p className="mt-1 text-base font-medium leading-8">{title}</p>
              {summary && <p className="mt-1 text-sm leading-7">{summary}</p>}
            </div>
            <div>
              <p className="mb-2 text-sm leading-7 text-muted-foreground">
                写判断前，推荐先看看这类事过去通常怎样。看完再想「这次有什么不同」。
              </p>
              <HistoryPanel signalId={practice.signal_id} initial={usable?.history ?? null} />
            </div>
            <JudgmentForm signalId={practice.signal_id} question={practice.question} knownTags={knownTags} />
          </div>
        </details>
      )}
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
  const [report, newsCount, toolsCount, judgments, digest] = await Promise.all([
    getDailyReport(user.id, date),
    countPendingSignals("news"),
    countPendingSignals("tools"),
    // 迁移 055 没跑时练习整块不显示，报告照常
    listJudgments(user.id).catch((e: Error) => {
      if (/signal_judgments/.test(e.message)) return null;
      throw e;
    }),
    getDigest(user.id, date).catch(() => null),
  ]);

  const practice = report !== "missing-schema" ? report.news?.practice ?? null : null;
  const newsPicks = report !== "missing-schema" ? (report.news?.items ?? []).filter((i) => !i.extra) : [];
  const practiceIndex = practice ? newsPicks.findIndex((i) => i.signal_id === practice.signal_id) : -1;
  const practiceItem = practiceIndex >= 0 ? newsPicks[practiceIndex] : null;
  const practiceJudgment =
    practice && judgments ? judgments.find((j) => j.signal_id === practice.signal_id) ?? null : null;
  const hiddenSignalId = practice && judgments && !practiceJudgment ? practice.signal_id : null;
  const mail = emailConfig();
  const hasAnySection = report !== "missing-schema" && SECTIONS.some((s) => report[s.kind]);

  // 念给他听的稿子：先念总览，再念每一节的总述和每条的标题、背景。练习题那一条还没写判断时不念背景，免得剧透。
  const listenScript =
    report === "missing-schema"
      ? []
      : [
          ...(digest && digest !== "missing-schema" ? ["今日总览", digest.summary] : []),
          ...SECTIONS.flatMap((section) => {
            const data = report[section.kind];
            const items = (data?.items ?? []).filter((i) => !i.extra);
            if (!data || items.length === 0) return [];
            return [
              section.title,
              ...(data.overview ? [data.overview] : []),
              ...items.map((i) =>
                i.signal_id === hiddenSignalId ? `${i.headline}。这条是今天的练习题，先自己判断。` : `${i.headline}。${i.background}`
              ),
            ];
          }),
        ];

  return (
    <PageContainer width="narrow">
      <PageHeader
        eyebrow={`Daily report · ${date}`}
        title={isToday ? "今日报告" : `${formatReportDate(date)}的报告`}
        description="先看总览，再做一道练习，然后按需往下翻五节。"
      />

      {/* 去别的页面的入口和往期，收成两行文字 */}
      <nav className="-mt-4 mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="text-muted-foreground transition-colors duration-150 hover:text-foreground">
            {l.label}
          </Link>
        ))}
        <Link href="/signals/inbox" className="text-muted-foreground transition-colors duration-150 hover:text-foreground">
          全部新闻 {newsCount}
        </Link>
        <Link href="/signals/inbox?tab=tools" className="text-muted-foreground transition-colors duration-150 hover:text-foreground">
          全部工具 {toolsCount}
        </Link>
      </nav>
      {report !== "missing-schema" && report.recentDates.length > 1 && (
        <nav className="mb-6 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span className="text-muted-foreground">往期：</span>
          {report.recentDates.map((d) => (
            <Link
              key={d}
              href={d === today ? "/signals" : `/signals?date=${d}`}
              className={d === date ? "font-medium text-primary" : "text-muted-foreground transition-colors duration-150 hover:text-foreground"}
            >
              {formatReportDate(d)}
            </Link>
          ))}
        </nav>
      )}

      {report === "missing-schema" ? (
        <div className="rounded-lg border border-status-validating/30 bg-status-validating/10 p-5 text-sm leading-7 text-status-validating">
          数据库还差一步：迁移 053 或 054 没跑。到 Supabase 的 SQL Editor 执行 supabase/migrations/054_signal_reports.sql 之后再来。
        </div>
      ) : (
        <>
          <DigestCard digest={digest === "missing-schema" ? null : digest} date={date} canGenerate={isToday && hasAnySection} />
          <div className="mb-8">
            <ListenButton paragraphs={listenScript} />
          </div>

          {judgments === null ? (
            <div className="mb-8 rounded-lg border border-status-validating/30 bg-status-validating/10 p-4 text-sm leading-7 text-status-validating">
              「先判断，再看答案」的练习还差一步：迁移 055 没跑。执行 supabase/migrations/055_signal_judgments.sql 之后，这里会出现每天的练习题。
            </div>
          ) : (
            <>
              {isToday && <DueJudgments rows={dueJudgments(judgments)} />}
              {practice && practiceItem && (
                <PracticeCard
                  practice={practice}
                  title={practiceItem.title}
                  position={practiceIndex + 1}
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

          <SectionTabs
            tabs={SECTIONS.map((section) => ({
              key: section.kind,
              label: section.tab,
              count: (report[section.kind]?.items ?? []).filter((i) => !i.extra).length,
              content: (
                <ReportSectionView
                  section={section}
                  data={report[section.kind]}
                  isToday={isToday}
                  earlier={report.earlier}
                  hiddenSignalId={section.kind === "news" ? hiddenSignalId : null}
                />
              ),
            }))}
          />
        </>
      )}

      <footer className="mt-16 space-y-4 border-t pt-4">
        {isToday && <ReaderPanel userId={user.id} />}
        <EmailPanel to={mail.ready ? mail.to : null} missing={mail.ready ? [] : mail.missing} />
      </footer>
    </PageContainer>
  );
}
