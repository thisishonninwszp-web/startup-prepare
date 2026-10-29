import { Suspense } from "react";
import { sharedViewFor } from "@/lib/domains/signals/users";
import { publicEarlier, publicItem } from "@/lib/domains/signals/shared-view";
import Link from "next/link";
import { NextActionLine } from "./next-action";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { getSignalDetail } from "@/lib/domains/signals/analysis";
import { tokyoToday } from "@/lib/domains/signals/brief";
import type { BriefItem } from "@/lib/domains/signals/brief";
import { getDigest, type Digest } from "@/lib/domains/signals/digest";
import { GITHUB_SOURCE_PREFIX, type SignalKind } from "@/lib/domains/signals/feeds";
import type { EarlierMention } from "@/lib/domains/signals/followups";
import { formatReportDate, isReportDate } from "@/lib/domains/signals/format";
import { emailConfig } from "@/lib/domains/signals/notify";
import { dueJudgments, knownTags, listJudgments, type JudgmentRow } from "@/lib/domains/signals/practice";
import { deadlineLabel, HORIZONS, isBlindPracticeDate, JUDGMENT_MODE_LABELS, type HorizonKey, type PracticeDraft } from "@/lib/domains/signals/practice-shared";
import { preparePractice } from "@/lib/domains/signals/practice-draft";
import { ensurePracticeBreakdown } from "@/lib/domains/signals/breakdown";
import { BreakdownFactors } from "@/components/breakdown-factors";
import type { SignalDetail } from "@/lib/domains/signals/analysis";
import { PracticeDraftCard } from "./practice-draft-card";
import { ForecastCard } from "./forecast/forecast-cards";
import { inlineQuestions, type InlineQuestion } from "@/lib/domains/signals/inline-questions";
import type { Breakdown } from "@/lib/domains/signals/breakdown-shared";
import { practiceHorizon, questionDeadline } from "@/lib/ai";
import { countPendingSignals, getDailyReport, type DailyReport, type ReportSection } from "./queries";
import { GenerateBriefButton } from "./brief-panel";
import { SourceCheckView } from "./check-view";
import { DigestLoader } from "./digest-loader";
import { DigestDetailButton } from "./digest-detail-button";
import { EmailPanel } from "./email-panel";
import { HistoryPanel } from "./history-panel";
import { ResolveJudgment } from "./judgment-forms";
import { OutcomeEvidenceView } from "./outcome-evidence";
import { PracticeComposer } from "./practice-composer";
import { formatDueDate, JudgmentView } from "./judgment-view";
import { ListenButton } from "./listen-button";
import { ReaderPanel } from "./reader-panel";
import { ListEntry } from "./list-entry";
import { buildListenScript } from "@/lib/domains/signals/listen-script";
import { sectionLayout } from "@/lib/domains/signals/section-habits";
import { followedSignals } from "@/lib/domains/signals/memory";
import { readingMinutes } from "@/lib/domains/signals/notify";
import { TodayBlocks } from "./today-blocks";
import { MarkButtons } from "./mark-buttons";
import { marksFor, type Mark } from "@/lib/domains/signals/memory";
import { SectionFeedback } from "./section-feedback";
import { getFeedback } from "@/lib/domains/signals/feedback";
import { describeMove, unusualFastMoves } from "@/lib/domains/signals/fast";
import { Badge } from "@/components/ui/badge";
import { FlowView } from "./flow-view";
import { TrackOpen } from "./track-open";
import { ReportEvidence } from "./report-evidence";
import { OpenedBadge, ReadingProgress } from "./reading-progress";
import { loadReadingSession } from "@/lib/domains/signals/reading-session";
import { loadReadingPreferences } from "@/lib/domains/signals/reading-preferences";
import { partitionReadingItems, preferenceForItem, type ReadingPreferencesState } from "@/lib/domains/signals/reading-preferences-shared";
import { StoryPreferenceButtons } from "./story-preference-buttons";
import { ReadingPreferencesPanel } from "./reading-preferences-panel";

export const dynamic = "force-dynamic";
// 「现在生成」「写下判断」的 server action 跟着页面的时长上限走，默认 10 秒不够。
export const maxDuration = 60;

/**
 * 每日报告保留总览、练习和五节精选。展开条目先看来源，再按需展开 AI；
 * 个人静音只收起展示，原报告保留；阅读终点由用户主动保存，不把展开当作读完。
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

/** 今天的练习那一条：展开就能点行不行（和「给你的」里那张卡同一套，点了哪边都算）。 */
type PracticeNow = {
  date: string;
  signalId: string;
  question: string;
  draft: PracticeDraft;
  knownTags: string[];
  horizon: HorizonKey;
  deadline?: string;
  breakdown: Breakdown | null;
};

/**
 * 读报时就地判断（经用户同意，2026-10-30）：他会读、会标，不会专门去做题（一周点开 15 次、标了 6 条，判了 2 道）。
 * 这条是今天的练习，或者挂着等他判断的预测题，展开以后读完事实就在原地摆出来，点一下就记。
 */
function JudgeHere({ signalId, practice, questions }: { signalId: string; practice?: PracticeNow; questions: InlineQuestion[] }) {
  return (
    <div className="mt-4 space-y-3">
      {practice && (
        <div className="border-l-2 border-primary pl-3">
          <p className="text-xs font-medium text-primary">这条是今天的练习，在这儿就能判</p>
          <p className="mt-1 text-sm font-medium leading-7">{practice.question}</p>
          {practice.breakdown && (
            <details className="mt-1 text-sm">
              <summary className="cursor-pointer text-muted-foreground">不知道从哪想起？看看主要看哪几样</summary>
              <BreakdownFactors breakdown={practice.breakdown} />
            </details>
          )}
          <PracticeDraftCard
            date={practice.date}
            signalId={signalId}
            question={practice.question}
            draft={practice.draft}
            knownTags={practice.knownTags}
            defaultHorizon={practice.horizon}
            deadline={practice.deadline}
          />
        </div>
      )}
      {questions.length > 0 && (
        <div className="border-l-2 border-primary pl-3">
          <p className="text-xs font-medium text-primary">从这条新闻出了{questions.length > 1 ? ` ${questions.length} 道` : "一道"}预测题，在这儿就能判</p>
          <ul className="mt-2 space-y-2">
            {questions.map((x) => (
              <ForecastCard key={x.q.id} q={x.q} blind={x.blind} anchor={x.anchor} three={x.three} breakdown={x.breakdown} inNews />
            ))}
          </ul>
        </div>
      )}
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
  mark,
  preferences,
  followed,
  practiceNow,
  questions = [],
}: {
  /** 这条是今天的练习、AI 已经先判了、他还没判：展开就能点行不行。 */
  practiceNow?: PracticeNow;
  /** 从这条新闻出的、等他判断的预测题。 */
  questions?: InlineQuestion[];
  item: BriefItem;
  n: number;
  forYouLabel: string;
  hidden: boolean;
  earlier?: EarlierMention;
  /** 他标过没有（展开以后可以直接标，不用点进详情页）。 */
  mark?: Mark;
  preferences: ReadingPreferencesState;
  /** 他在跟这一条（标过、点开过两天以上、写过判断……见 followedSignals）。 */
  followed?: boolean;
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
    earlier ? "后续" : null,
    followed ? "你在跟" : null,
    item.precedent ? "先例" : null,
    showChina || (item.japan && /^(没有|有类似的)/.test(item.japan)) ? (item.origin === "us" ? "美日差距" : "中日差距") : null,
  ].filter((x): x is string => !!x);

  return (
    <li>
      <details id={`item-${item.signal_id}`} className="group scroll-mt-16">
        <summary className="flex cursor-pointer list-none gap-3 py-3 transition-colors duration-150 hover:text-primary">
          <TrackOpen signalId={item.signal_id} />
          <span className="mt-0.5 font-mono text-xs text-muted-foreground">{String(n).padStart(2, "0")}</span>
          <span className="min-w-0 flex-1">
            {/* 报纸标题：有短标题就用它，原来那一句放在下面一行 */}
            <span className="text-base font-medium leading-7">{item.short ?? item.headline}</span>
            <span className="ml-2"><OpenedBadge signalId={item.signal_id} /></span>
            {item.short && <span className="block text-sm leading-6 text-muted-foreground">{item.headline}</span>}
            {chips.length > 0 && (
              <span className="mt-1 flex flex-wrap gap-1">
                {chips.map((c) => (
                  <Badge key={c} variant={c === "意外" || c === "你的优势" || c === "你在追的问题" || c === "你在跟" ? "default" : "muted"}>
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
          <div className="mb-1">
            <MarkButtons signalId={item.signal_id} initial={mark?.mark ?? null} initialNote={mark?.note ?? null} compact />
          </div>
          <p className="font-mono text-xs text-muted-foreground">{item.source}</p>
          <p className="mt-1 text-xs leading-6 text-muted-foreground">入选方式：当天候选经来源平衡后，由 AI 选入通用精选。个人关联是后续分析，不是按你的点击次数选入。</p>
          <div className="mt-2">
            <StoryPreferenceButtons signalId={item.signal_id} event={item.event} initial={preferenceForItem(item, preferences.preferences)} available={preferences.status === "ready"} />
          </div>
          <ReportEvidence item={item} earlier={earlier} showBackground={false} />
          {earlier && <EarlierLine mention={earlier} />}
          {practiceNow || questions.length > 0 ? (
            <JudgeHere signalId={item.signal_id} practice={practiceNow} questions={questions} />
          ) : (
            <p className="mt-3 text-sm"><Link href={`/signals/${item.signal_id}`} className="text-primary hover:underline">先写一句自己的判断 →</Link></p>
          )}
          {hidden ? (
            <p className="mt-2 rounded-md bg-muted/60 px-3 py-2 text-sm leading-7 text-muted-foreground">
              这条是今天的练习题。先在上面写下你的判断，AI 的解读再出来。
            </p>
          ) : (
            <details className="mt-3 rounded-md border px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium">直接展开 AI 整理与推断</summary>
              <p className="mt-2 text-xs leading-6 text-muted-foreground">背景是 AI 整理，影响、关联和类比属于解释或推断；不等于来源已证实的事实。</p>
              {item.flow && <FlowView flow={item.flow} />}
              <h3 className="mt-3 text-xs font-medium text-muted-foreground">AI 整理的背景</h3>
              <p className="mt-2 text-base leading-8">{item.background}</p>
              {item.grounded === false && (
                <p className="mt-1 text-xs text-muted-foreground">
                  没读到正文，这段背景只根据标题和一两句简介写，具体数字和日期可能不准。
                </p>
              )}
              <p className="mt-2 text-sm leading-7">
                <span className="text-muted-foreground">AI 推断 · {forYouLabel}：</span>
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
              {item.related_question && (
                <p className="mt-2 border-l-2 border-primary pl-3 text-sm leading-7">
                  <span className="text-muted-foreground">AI 判断的关联 · 跟你在追的问题有关：</span>
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
                  <span className="text-muted-foreground">AI 判断的关联 · {item.personal_edge ? "你的优势：" : "跟你："}</span>
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
            </details>
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
  canGenerate,
  hiddenSignalId,
  earlier,
  date,
  feedback,
  marks,
  preferences,
  followed,
  practiceNow,
  inline,
}: {
  /** 今天的练习那一条（AI 先判了、他还没判）。 */
  practiceNow: PracticeNow | null;
  /** 哪几条新闻挂着等他判断的预测题。 */
  inline: Record<string, InlineQuestion[]>;
  /** 他在跟的那几条。 */
  followed: string[];
  /** 他标过的（signal_id → 标记）。 */
  marks: Record<string, Mark>;
  preferences: ReadingPreferencesState;
  section: (typeof SECTIONS)[number];
  data: ReportSection | null;
  isToday: boolean;
  /** 能不能自己生成 / 重新生成这一节（看共用那一份的账号不能）。 */
  canGenerate: boolean;
  date: string;
  /** 这一节今天点过的"有用 / 没用"。 */
  feedback?: boolean;
  /** 之前的报告也出现过同一件事的条目。 */
  earlier: Record<string, EarlierMention>;
  /** 今天的练习题还没写判断时，这一条的 AI 解读先藏起来。 */
  hiddenSignalId: string | null;
}) {
  const { visible, muted } = partitionReadingItems(data?.items ?? [], preferences.preferences);
  const picks = visible.filter((i) => !i.extra);
  // 新工具和新可能分成两组：GitHub 仓库一组，降价、规制缓和、日本首次提供一组
  const groups =
    section.kind === "tools"
      ? [
          { label: "GitHub 新工具", items: picks.filter((i) => i.source === "GitHub 新仓库") },
          { label: "新可能：降价、规制缓和、日本首次提供", items: picks.filter((i) => i.source !== "GitHub 新仓库") },
        ].filter((g) => g.items.length > 0)
      : [{ label: null as string | null, items: picks }];

  return (
    <section id={`section-${section.kind}`} className="mt-10 scroll-mt-16 border-t-2 border-foreground pt-2">
      <h2 className="text-lg font-semibold">
        {section.title}
        {picks.length > 0 && <span className="ml-2 text-xs font-normal text-muted-foreground">{picks.length} 条</span>}
      </h2>

      {data && picks.length === 0 ? (
        <div className="mt-4">
          {muted.length === 0 && data.overview && <p className="text-base leading-8">{data.overview}</p>}
          <p className="mt-2 text-sm leading-7 text-muted-foreground">{muted.length ? "这一节的精选已按你的设置收起，可在下面查看或恢复。" : "这一批消息里没有能放进这一节的。宁可空着，也不硬凑。"}</p>
        </div>
      ) : !data ? (
        <div className="mt-4 rounded-lg border border-dashed bg-dotgrid px-6 py-8 text-center">
          <p className="text-sm">{section.empty}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {!isToday ? "那天没有生成这一份。" : canGenerate ? "每天早上会自动生成；现在想看就点下面，大约要十几秒。" : "每天早上会自动生成，还没好的话过一会儿再来。"}
          </p>
          {canGenerate && (
            <div className="mt-4 flex justify-center">
              <GenerateBriefButton kind={section.kind} />
            </div>
          )}
        </div>
      ) : (
        <>
          {muted.length === 0 && data.overview && <details className="mt-2 text-sm leading-7 text-muted-foreground"><summary className="cursor-pointer">展开本节 AI 总览</summary><p className="mt-2">{data.overview}</p></details>}
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
                      mark={marks[item.signal_id]}
                      preferences={preferences}
                      followed={followed.includes(item.signal_id)}
                      practiceNow={practiceNow?.signalId === item.signal_id ? practiceNow : undefined}
                      questions={inline[item.signal_id]}
                    />
                  ))}
                </ol>
              </div>
            );
          })}
          {visible.some((item) => item.extra) && (
            <details className="mt-6">
              <summary className="cursor-pointer text-sm text-muted-foreground">
                可选探索：还有 {visible.filter((item) => item.extra).length} 条
              </summary>
              <ul className="mt-2 space-y-2">
                {visible
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
          <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
            <SectionFeedback date={date} kind={section.kind} initial={feedback} />
            {canGenerate && <GenerateBriefButton kind={section.kind} regenerate />}
          </div>
        </>
      )}
      {muted.length > 0 && (
        <details className="mt-4 rounded-md border border-dashed p-3">
          <summary className="cursor-pointer text-sm text-muted-foreground">已静音的内容（{muted.length} 条，按需查看或恢复）</summary>
          <ol className="divide-y">
            {muted.map((item, i) => <ReportItem key={item.signal_id} item={item} n={i + 1} forYouLabel={section.forYouLabel} hidden={item.signal_id === hiddenSignalId} earlier={earlier[item.signal_id]} mark={marks[item.signal_id]} preferences={preferences} />)}
          </ol>
        </details>
      )}
    </section>
  );
}

/** 今日总览：像一个懂行的人看完五节，跟你讲几句今天世界上发生了什么。 */
/** 详细报告：每件事发生了什么、来龙去脉、还不知道的、接下来盯什么。默认收起。 */
function DigestDetailView({ detail, date, canRewrite }: { detail: NonNullable<Digest["detail"]>; date: string; canRewrite: boolean }) {
  return (
    <details>
      <summary className="cursor-pointer text-sm font-medium text-primary">详细报告：今天最重要的 {detail.themes.length} 件事 →</summary>
      <div className="mt-4 space-y-8">
        {detail.themes.map((t) => (
          <article key={t.title}>
            <h3 className="text-base font-semibold leading-7">{t.title}</h3>
            <p className="mt-2 text-sm leading-7">{t.happened}</p>
            {t.context && (
              <p className="mt-2 text-sm leading-7">
                <span className="text-muted-foreground">来龙去脉：</span>
                {t.context}
              </p>
            )}
            {t.open && (
              <p className="mt-2 text-sm leading-7">
                <span className="text-muted-foreground">还不知道的（这是推测）：</span>
                {t.open}
              </p>
            )}
            <p className="mt-2 text-sm leading-7">
              <span className="text-muted-foreground">接下来盯什么：</span>
              {t.watch}
            </p>
            <ul className="mt-2 space-y-1 text-xs leading-6 text-muted-foreground">
              {t.signalIds.map((id, i) => (
                <li key={id}>
                  出自：
                  <a href={`#item-${id}`} className="underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline">
                    {t.headlines[i] || "报告里的一条"}
                  </a>
                </li>
              ))}
            </ul>
          </article>
        ))}
        {canRewrite && <DigestDetailButton date={date} rewrite />}
      </div>
    </details>
  );
}

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
          {digest.chain && (
            <div className="mt-4 border-t pt-3 text-sm leading-7">
              <p className="text-muted-foreground">可以往下推的一条（这是推测，还没检验）：</p>
              <p className="mt-1">{digest.chain.steps.join(" → ")}</p>
              <Link
                href={`/signals/${digest.chain.signal_id}?skip=1#inference`}
                className="text-xs text-primary underline-offset-4 hover:underline"
              >
                去「往下推」里查证据、看每一步有多大可能 →
              </Link>
            </div>
          )}
          <div className="mt-4 border-t pt-3">
            {digest.detail ? (
              <DigestDetailView detail={digest.detail} date={date} canRewrite={canGenerate} />
            ) : canGenerate ? (
              <DigestDetailButton date={date} />
            ) : null}
          </div>
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

/** 到期的判断，打开页面时自动查证据的最多几条（每条搜两次），其余点按钮查。 */
const AUTO_EVIDENCE = 3;

function DueJudgments({ rows }: { rows: JudgmentRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="mb-8 rounded-lg border border-primary/40 bg-card p-5">
      <h2 className="text-base font-semibold">到期了，对一下账（{rows.length}）</h2>
      <p className="mt-1 text-sm leading-7 text-muted-foreground">这些是你之前写下的判断。下面先摆出上网查到的现在实际怎样了，看完再标对错。</p>
      <ul className="mt-4 space-y-6">
        {rows.map((r, i) => (
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
            <OutcomeEvidenceView judgmentId={r.id} evidence={r.outcome_evidence ?? null} auto={i < AUTO_EVIDENCE && r.outcome_evidence === null} />
            <ResolveJudgment predictionId={r.prediction_id} />
          </li>
        ))}
      </ul>
    </section>
  );
}

type PracticeProps = {
  /** 这份报告是哪一天的（拆解卡、AI 先判存在那一天的报告里）。 */
  date: string;
  practice: NonNullable<ReportSection["practice"]>;
  title: string;
  summary: string;
  history: SignalDetail["history"] | null;
  knownTags: string[];
  horizon: HorizonKey;
  deadline?: string;
};

/** 自己先判（周一的练习、以前的日子、AI 没判出来的时候）：照原来的样子，可以先看历史、先拆一拆再写。 */
function BlindPractice({ date, practice, title, summary, history, knownTags, horizon, deadline }: PracticeProps) {
  return (
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
          <HistoryPanel signalId={practice.signal_id} initial={history} />
        </div>
        <p className="text-sm leading-7 text-muted-foreground">
          {deadline
            ? `题目问的是到${deadlineLabel(deadline)}，对账就按这个日子（多留一周等消息出来）。觉得不对就换一档。`
            : `这道题${HORIZONS[horizon].label.replace("后", "")}左右见分晓，期限已经替你选好了；觉得不对就改。`}
        </p>
        <PracticeComposer
          date={date}
          initialBreakdown={practice.breakdown ?? null}
          signalId={practice.signal_id}
          question={practice.question}
          knownTags={knownTags}
          defaultHorizon={horizon}
          deadline={deadline}
          factorsAbove={!!practice.breakdown}
        />
      </div>
    </details>
  );
}

/**
 * AI 先判了：上面点行 / 不行。拆解卡已经摆在题目下面（后台先拆好的），下面只留历史参照；
 * 没拆出来的（老日子、拆失败）照旧在「想自己想一想」里能点「先拆一拆」。
 */
function DraftPractice({ draft, ...props }: PracticeProps & { draft: PracticeDraft }) {
  const { date, practice, history, knownTags, horizon, deadline } = props;
  if (practice.breakdown) {
    return (
      <>
        <PracticeDraftCard
          date={date}
          signalId={practice.signal_id}
          question={practice.question}
          draft={draft}
          knownTags={knownTags}
          defaultHorizon={horizon}
          deadline={deadline}
        />
        <div className="mt-4">
          <HistoryPanel signalId={practice.signal_id} initial={history} label="看历史上类似的事后来怎样" />
        </div>
      </>
    );
  }
  return (
    <>
      <PracticeDraftCard
        date={date}
        signalId={practice.signal_id}
        question={practice.question}
        draft={draft}
        knownTags={knownTags}
        defaultHorizon={horizon}
        deadline={deadline}
      />
      <details className="mt-4">
        <summary className="cursor-pointer text-sm text-muted-foreground">想自己想一想</summary>
        <div className="mt-4 space-y-5">
          <HistoryPanel signalId={practice.signal_id} initial={history} label="看历史上类似的事" />
          <PracticeComposer
            date={date}
            initialBreakdown={practice.breakdown ?? null}
            signalId={practice.signal_id}
            question={practice.question}
            knownTags={knownTags}
            defaultHorizon={horizon}
            deadline={deadline}
            withForm={false}
          />
        </div>
      </details>
    </>
  );
}

/** 今天的题还没有 AI 先判（后台 7:30 还没跑到）：AI 先判和拆解卡现在一起出，二三十秒；先判出不来就自己判。 */
async function PracticeDraftLoader({ poolUserId, ...props }: PracticeProps & { poolUserId: string }) {
  const ready = await preparePractice(poolUserId, props.date).catch((e) => {
    console.error("practice draft", e);
    return { draft: null, breakdown: null, errors: [] };
  });
  const withBreakdown = { ...props, practice: { ...props.practice, breakdown: props.practice.breakdown ?? ready.breakdown ?? undefined } };
  const factors = !props.practice.breakdown && ready.breakdown ? <BreakdownFactors breakdown={ready.breakdown} /> : null;
  if (ready.draft)
    return (
      <>
        {factors}
        <DraftPractice draft={ready.draft} {...withBreakdown} />
      </>
    );
  return (
    <>
      {factors}
      <p className="mt-4 text-xs text-muted-foreground">AI 这次没判出来，这道你自己判。</p>
      <BlindPractice {...withBreakdown} />
    </>
  );
}

/** 已经有 AI 先判（或周一的先判题）、只是还没拆：现在拆，二三十秒；拆不出来就不摆。 */
async function PracticeBreakdownLoader({ poolUserId, date }: { poolUserId: string; date: string }) {
  const breakdown = await ensurePracticeBreakdown(poolUserId, date).catch((e) => {
    console.error("practice breakdown", e);
    return null;
  });
  return breakdown ? <BreakdownFactors breakdown={breakdown} /> : null;
}

async function PracticeCard({
  practice,
  title,
  position,
  judgment,
  knownTags,
  date,
  isToday,
  poolUserId,
}: {
  /** 这份报告是哪一天的（拆解卡、AI 先判存在那一天的报告里）。 */
  date: string;
  practice: NonNullable<ReportSection["practice"]>;
  title: string;
  /** 这道题出自"今天的世界"第几条。 */
  position: number;
  judgment: JudgmentRow | null;
  knownTags: string[];
  /** 只有今天的题会现出 AI 先判（以前的日子没出过就自己判）。 */
  isToday: boolean;
  /** 报告是哪个账号的（朋友读主账号那份），AI 先判存在那份上。 */
  poolUserId: string;
}) {
  const detail = await getSignalDetail(practice.signal_id);
  const usable = detail && detail !== "missing-schema" ? detail : null;
  // 多久能见分晓：存下的优先；老数据按题目里写的时间点现算（"到明年底"不能配一个月后对账）
  const horizon: HorizonKey =
    practice.horizon && practice.horizon in HORIZONS ? (practice.horizon as HorizonKey) : practiceHorizon(practice.question, undefined, tokyoToday());
  const deadlineDate = questionDeadline(practice.question, tokyoToday());
  const deadline = deadlineDate ? deadlineDate.toISOString().slice(0, 10) : undefined;
  // 经用户明确裁决（2026-10-23）：AI 先判、他点行不行；每周一的练习照旧先自己判
  const blindDay = isBlindPracticeDate(date);
  const props: PracticeProps = { date, practice, title, summary: usable?.summary ?? "", history: usable?.history ?? null, knownTags, horizon, deadline };
  return (
    <section className="mb-8 rounded-lg border bg-card p-5">
      <h2 className="text-lg font-semibold">
        {judgment ? "今天的练习" : blindDay ? "今天的练习（周一）：先自己判，再看 AI 的" : "今天的练习：AI 先判了，你看行不行"}
      </h2>
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

      {/* 「从这几样想起」：题目下面、AI 的判断前面（经用户同意，2026-10-24）。还没先判的那种由 PracticeDraftLoader 一起出 */}
      {!judgment &&
        (practice.breakdown ? (
          <BreakdownFactors breakdown={practice.breakdown} />
        ) : isToday && (blindDay || practice.ai_draft) ? (
          <Suspense fallback={<p className="mt-3 text-sm text-muted-foreground">AI 在拆这件事主要看哪几样……二三十秒</p>}>
            <PracticeBreakdownLoader poolUserId={poolUserId} date={date} />
          </Suspense>
        ) : null)}

      {judgment ? (
        <>
          <p className="mt-4 text-sm leading-7">
            <span className="text-muted-foreground">{judgment.mode === undefined ? "你写了：" : `${JUDGMENT_MODE_LABELS[judgment.mode ?? "blind"]}：`}</span>
            {judgment.judgment}
            <span className="ml-1 font-mono text-xs text-muted-foreground">· {formatDueDate(judgment.due_at)}对账</span>
          </p>
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-muted-foreground">{judgment.mode === "agree" ? "到时候看什么" : "看 AI 怎么拆、到时候看什么"}</summary>
            <div className="mt-3">
              <JudgmentView judgment={judgment} showQuestion={false} />
              <p className="mt-4 leading-7 text-muted-foreground">到时候看什么：{practice.check_how}</p>
              <p className="mt-2 leading-7">
                <a href={`/signals/${practice.signal_id}#inference`} className="text-primary underline-offset-4 hover:underline">
                  如果真的发生，会波及谁？去往下推 →
                </a>
              </p>
              <div className="mt-5 border-t pt-4">
                <HistoryPanel signalId={practice.signal_id} initial={usable?.history ?? null} label="看历史上类似的事" />
              </div>
            </div>
          </details>
        </>
      ) : blindDay ? (
        <BlindPractice {...props} />
      ) : practice.ai_draft ? (
        <DraftPractice draft={practice.ai_draft} {...props} />
      ) : isToday ? (
        <Suspense fallback={<p className="mt-4 text-sm text-muted-foreground">AI 在查资料、拆这件事主要看哪几样、判这道题……二三十秒</p>}>
          <PracticeDraftLoader poolUserId={poolUserId} {...props} />
        </Suspense>
      ) : (
        <BlindPractice {...props} />
      )}
    </section>
  );
}

/** 共用那一份给别的账号看：每节的精选去掉只关于主账号的几句，「之前上过」去掉他那次写的判断。 */
function publicReport(report: DailyReport): DailyReport {
  const section = (s: ReportSection | null): ReportSection | null => (s ? { ...s, items: s.items.map(publicItem) } : s);
  return {
    ...report,
    news: section(report.news),
    tools: section(report.tools),
    voices: section(report.voices),
    calendar: section(report.calendar),
    money: section(report.money),
    earlier: publicEarlier(report.earlier),
  };
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
  // 朋友的账号看主账号那一份（共用，去掉只关于主账号的几句）；自己就是主账号或没配主账号时看自己的
  const view = await sharedViewFor(user.id);
  const [rawReport, newsCount, toolsCount, judgments, digest, feedback, fastAlerts, preferences] = await Promise.all([
    getDailyReport(view.sourceUserId, date),
    countPendingSignals("news", undefined, view.shared ? user.id : undefined),
    countPendingSignals("tools", [GITHUB_SOURCE_PREFIX], view.shared ? user.id : undefined),
    // 迁移 055 没跑时练习整块不显示，报告照常
    listJudgments(user.id).catch((e: Error) => {
      if (/signal_judgments/.test(e.message)) return null;
      throw e;
    }),
    getDigest(view.sourceUserId, date).catch(() => null),
    getFeedback(user.id, date),
    isToday ? unusualFastMoves().catch(() => []) : Promise.resolve([]),
    loadReadingPreferences(user.id),
  ]);
  // 版面按他最近 30 天的阅读习惯排（点开、标记、有用 / 没用），在跟的几条标「你在跟」
  const [layout, followedRows] = await Promise.all([
    sectionLayout(
      user.id,
      SECTIONS.map((s) => s.kind)
    ),
    followedSignals(user.id, view.shared).catch(() => []),
  ]);
  const followed = followedRows.map((f) => f.signal_id);

  const report = rawReport !== "missing-schema" && view.shared ? publicReport(rawReport) : rawReport;
  const allItems = report === "missing-schema" ? [] : SECTIONS.flatMap((s) => report[s.kind]?.items ?? []);
  const selection = partitionReadingItems(allItems, preferences.preferences);
  const selectedIds = [...new Set(selection.visible.filter((item) => !item.extra).map((item) => item.signal_id))];
  const reading = report === "missing-schema" ? null : await loadReadingSession(user.id, date, selectedIds);
  const hideOverview = selection.muted.length > 0;
  // 各节每一条他标过没有（展开以后能直接标）
  const marks = Object.fromEntries(
    await marksFor(
      user.id,
      report === "missing-schema" ? [] : SECTIONS.flatMap((s) => (report[s.kind]?.items ?? []).map((i) => i.signal_id))
    ).catch(() => new Map<string, Mark>())
  );
  const practice = report !== "missing-schema" ? report.news?.practice ?? null : null;
  const newsPicks = report !== "missing-schema" ? partitionReadingItems(report.news?.items ?? [], preferences.preferences).visible.filter((i) => !i.extra) : [];
  const practiceIndex = practice ? newsPicks.findIndex((i) => i.signal_id === practice.signal_id) : -1;
  const practiceItem = practiceIndex >= 0 ? newsPicks[practiceIndex] : null;
  const practiceJudgment =
    practice && judgments ? judgments.find((j) => j.signal_id === practice.signal_id) ?? null : null;
  // 先判的日子（周一）才把那一条的解读藏到判完；AI 先判的日子 AI 的判断已经摆着了，再藏只是多一道手续
  const hiddenSignalId = practice && judgments && !practiceJudgment && isBlindPracticeDate(date) ? practice.signal_id : null;
  // 读报时就地判断（2026-10-30）：练习那一条、挂着预测题的几条，展开就能判（只有今天的；周一先判那道照旧在上面写）
  const practiceNow: PracticeNow | null =
    isToday && practice?.ai_draft && judgments && !practiceJudgment && !isBlindPracticeDate(date)
      ? {
          date,
          signalId: practice.signal_id,
          question: practice.question,
          draft: practice.ai_draft,
          knownTags: knownTags(judgments),
          horizon: practice.horizon && practice.horizon in HORIZONS ? (practice.horizon as HorizonKey) : practiceHorizon(practice.question, undefined, today),
          deadline: questionDeadline(practice.question, today)?.toISOString().slice(0, 10),
          breakdown: practice.breakdown ?? null,
        }
      : null;
  const inline = isToday ? await inlineQuestions(user.id, today, selectedIds).catch(() => ({})) : {};
  const mail = emailConfig();
  const hasAnySection = report !== "missing-schema" && SECTIONS.some((s) => report[s.kind]);

  // 念给他听的稿子：先念总览，再念每一节的总述和每条的标题、背景。练习题那一条还没写判断时不念背景，免得剧透。
  const listenScript =
    report === "missing-schema"
      ? []
      : buildListenScript({
          digest: !hideOverview && digest && digest !== "missing-schema" ? digest.summary : null,
          hiddenSignalId,
          sections: SECTIONS.map((section) => {
            const data = report[section.kind];
            const { visible, muted } = partitionReadingItems(data?.items ?? [], preferences.preferences);
            return { title: section.title, overview: muted.length === 0 ? data?.overview ?? null : null, items: visible.filter((i) => !i.extra) };
          }),
        });

  return (
    <PageContainer width="narrow">
      <PageHeader
        eyebrow={`Today · ${date}`}
        title={isToday ? "今天" : `${formatReportDate(date)}的报告`}
        description={
          isToday
            ? "看今天发生了什么，接着追踪昨天的事。先看来源，按需展开 AI 分析；理解了就可以结束。"
            : "那天的总览和五节精选。"
        }
      />

      {isToday && (
        <Suspense fallback={null}>
          <NextActionLine userId={user.id} />
        </Suspense>
      )}
      {report !== "missing-schema" && (
        <p className="-mt-4 mb-4 text-xs text-muted-foreground">
          约 {readingMinutes(listenScript.join(""))} 分钟读完 · {SECTIONS.filter((s) => (report[s.kind]?.items ?? []).some((i) => !i.extra)).length} 个版面{" "}
          {selectedIds.length} 条
          {isToday && selectedIds.length > 0 && (
            <>
              {" · "}
              <Link href="/signals/quick" className="text-primary underline-offset-4 hover:underline">
                速读：一条一屏，左右滑 →
              </Link>
            </>
          )}
        </p>
      )}
      {isToday && (
        <Suspense fallback={null}>
          <ListEntry userId={user.id} today={today} />
        </Suspense>
      )}
      {/* 去别的页面的入口在顶上的导航里；这里只留全部新闻、工具各攒了多少和往期 */}
      <nav className="-mt-4 mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <Link href="/signals/inbox" className="text-muted-foreground transition-colors duration-150 hover:text-foreground">
          全部新闻 {newsCount}
        </Link>
        <Link href="/signals/inbox?tab=tools" className="text-muted-foreground transition-colors duration-150 hover:text-foreground">
          全部工具 {toolsCount}
        </Link>
      </nav>
      <ReadingPreferencesPanel state={preferences} />
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
        <ReadingProgress key={date} date={date} ids={selectedIds} initial={reading!}>
          {fastAlerts.length > 0 && (
            <div className="mb-6 rounded-lg border border-border bg-card p-4 text-sm leading-7">
              <p className="font-medium">这一周动得不寻常的</p>
              <ul className="mt-1 space-y-1">
                {fastAlerts.map((m) => (
                  <li key={m.variable.key}>{describeMove(m)}</li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-muted-foreground">
                只是说它动得大，不说它接下来往哪走。想知道为什么动，翻翻今天的世界那一节。
              </p>
            </div>
          )}
          {view.shared && (
            <p className="mb-6 text-xs leading-6 text-muted-foreground">
              这是大家共用的一份报告，每天早上自动生成。你的判断、标记、记成的观察都是你自己的，别人看不到。
            </p>
          )}
          {!hideOverview && digest && digest !== "missing-schema" && digest.picks.length > 0 && (
            <section className="mb-6">
              <p className="mb-1 text-xs font-semibold tracking-wider text-primary">头版</p>
              <ul className="space-y-1">
                {digest.picks.slice(0, 3).map((pick) => {
                  const item = allItems.find((i) => i.signal_id === pick.signal_id);
                  return (
                    <li key={pick.signal_id} className="text-base font-semibold leading-7">
                      <a href={`#item-${pick.signal_id}`} className="transition-colors duration-150 hover:text-primary">
                        {item?.short ?? pick.headline}
                      </a>
                      {item?.source && <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">{item.source}</span>}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {hideOverview ? (
            <p className="mb-4 text-xs leading-6 text-muted-foreground">你的静音设置已应用；混合总览暂时收起，避免再次出现静音事件。下面按你的设置展示精选。</p>
          ) : (
            <details className="mb-4 rounded-lg border px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium">按需展开 AI 今日总览</summary>
              <div className="mt-3"><DigestCard digest={digest === "missing-schema" ? null : digest} date={date} canGenerate={isToday && hasAnySection && !view.shared} /></div>
            </details>
          )}
          <div className="mb-8">
            <ListenButton paragraphs={listenScript} />
          </div>

          <div className="mb-8 rounded-lg border-l-4 border-primary/60 bg-primary/5 px-4 pt-4">
          <p className="mb-3 text-xs font-semibold tracking-wider text-primary">给你的</p>
          {isToday && (
            <Suspense fallback={<p className="mb-8 text-xs text-muted-foreground">在翻你在跟的事……</p>}>
              <TodayBlocks userId={user.id} today={today} />
            </Suspense>
          )}

          {judgments === null ? (
            <div className="mb-8 rounded-lg border border-status-validating/30 bg-status-validating/10 p-4 text-sm leading-7 text-status-validating">
              「先判断，再看答案」的练习还差一步：迁移 055 没跑。执行 supabase/migrations/055_signal_judgments.sql 之后，这里会出现每天的练习题。
            </div>
          ) : (
            <>
              {isToday && <DueJudgments rows={dueJudgments(judgments)} />}
              {practice && practiceItem && (
                <PracticeCard
                  date={date}
                  practice={practice}
                  title={practiceItem.title}
                  position={practiceIndex + 1}
                  judgment={practiceJudgment}
                  knownTags={knownTags(judgments)}
                  isToday={isToday}
                  poolUserId={view.sourceUserId}
                />
              )}
              {isToday && report.news && !practice && (
                <p className="mb-8 text-sm leading-7 text-muted-foreground">
                  今天这份报告是在练习功能上线前生成的，没有练习题。点「今天的世界」下面的「重新生成这一份」就会有。
                </p>
              )}
            </>
          )}
          </div>

          <p className="mb-1 mt-4 text-xs leading-6 text-muted-foreground">
            每一节从当天抓到的几百条里挑五条，按你最近一个月点开、标记得多少排先后；一直没碰过的几节收在最后。全部的在「全部新闻」。
          </p>
          {layout.order.map((kind) => {
            const section = SECTIONS.find((s) => s.kind === kind)!;
            const view_ = (
              <ReportSectionView
                section={section}
                data={report[section.kind]}
                isToday={isToday}
                canGenerate={isToday && !view.shared}
                earlier={report.earlier}
                hiddenSignalId={section.kind === "news" ? hiddenSignalId : null}
                date={date}
                feedback={feedback[section.kind as keyof typeof feedback]}
                marks={marks}
                preferences={preferences}
                followed={followed}
                practiceNow={section.kind === "news" ? practiceNow : null}
                inline={inline}
              />
            );
            return layout.folded.includes(kind) ? (
              <details key={kind} className="mt-8 rounded-md border border-dashed px-3 py-2">
                <summary className="cursor-pointer text-sm text-muted-foreground">
                  {section.title} · 你最近一个月没点开过这一节，收起来了（{partitionReadingItems(report[kind]?.items ?? [], preferences.preferences).visible.filter((i) => !i.extra).length} 条）
                </summary>
                {view_}
              </details>
            ) : (
              <div key={kind}>{view_}</div>
            );
          })}
        </ReadingProgress>
      )}

      <footer className="mt-16 space-y-4 border-t pt-4">
        {isToday && <ReaderPanel userId={user.id} />}
        {view.shared ? (
          <p className="text-xs leading-6 text-muted-foreground">每天早上报告好了，提醒邮件会发到你注册用的邮箱。</p>
        ) : (
          <EmailPanel to={mail.ready ? mail.to : null} missing={mail.ready ? [] : mail.missing} />
        )}
      </footer>
    </PageContainer>
  );
}
