"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AiErrorNotice } from "@/components/ai-error-notice";
import {
  generateCentralQuestionsForReframing,
  markReframingFrame,
  promoteFrameToObservation,
  selectReframingCentralQuestion,
} from "@/app/(app)/reasoning/actions";
import { RealitySourceCard } from "@/app/(app)/reasoning/reality-source-card";
import type { RealityReasoningSnapshot } from "@/app/(app)/reasoning/reality-source";
import { frameGroup, FRAME_TYPES } from "@/app/(app)/reasoning/types";
import type { ReframingFrame, ReframingSessionWithFrames } from "@/app/(app)/reasoning/types";
import type {
  CentralQuestionCandidate,
  CentralQuestionType,
} from "@/lib/domains/concepts/types";

const GROUP_COLORS: Record<string, string> = {
  "时间维度": "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-300",
  "空间维度": "bg-violet-50 border-violet-200 text-violet-700 dark:bg-violet-950/30 dark:border-violet-800 dark:text-violet-300",
  "人物维度": "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300",
  "意义维度": "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300",
  "假设维度": "bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-950/30 dark:border-rose-800 dark:text-rose-300",
  "系统维度": "bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-950/30 dark:border-orange-800 dark:text-orange-300",
  "情绪与自我": "bg-pink-50 border-pink-200 text-pink-700 dark:bg-pink-950/30 dark:border-pink-800 dark:text-pink-300",
  "叙事与模式": "bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950/30 dark:border-indigo-800 dark:text-indigo-300",
  "行动与系统": "bg-teal-50 border-teal-200 text-teal-700 dark:bg-teal-950/30 dark:border-teal-800 dark:text-teal-300",
};

const FRAME_TYPE_LABELS: Record<string, string> = {
  time_compress: "时间压缩",
  time_expand: "时间拉长",
  time_origin: "追溯起点",
  time_retrospect: "未来回望",
  space_zoom_in: "放大局部",
  space_zoom_out: "缩小至系统",
  person_opponent: "换位对手",
  person_beginner: "初学者视角",
  person_expert: "领域专家",
  meaning_intent: "积极意图",
  meaning_rebuild: "意义重建",
  meaning_criteria: "标准切换",
  assumption_flip: "反向假设",
  redefine_problem: "重新定义问题",
  second_order: "第二序改变",
  resource_reframe: "资源重估",
  consequence_extend: "后果延伸",
  ecology_check: "生态影响",
  emotion_separate: "情绪与事实分离",
  apply_to_friend: "智慧朋友框架",
  stoic_control: "斯多葛控制二分",
  narrative_reframe: "叙事版本重写",
  pattern_recognition: "反复模式识别",
  minimum_viable_move: "最小行动一步",
  leverage_point: "系统杠杆点",
  gift_frame: "困境赠礼",
};

function FrameCard({ frame }: { frame: ReframingFrame }) {
  const [marked, setMarked] = useState(frame.is_marked);
  const [markPending, startMark] = useTransition();
  const [promotePending, startPromote] = useTransition();
  const [promoted, setPromoted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const group = frameGroup(frame.frame_type);
  const colorClass = GROUP_COLORS[group] ?? "bg-muted border-border text-muted-foreground";

  function handleMark() {
    startMark(async () => {
      try {
        await markReframingFrame(frame.id, !marked);
        setMarked((v) => !v);
      } catch (caught) {
        console.error("标记重构视角失败", caught);
        setError(caught instanceof Error ? caught.message : "标记失败");
      }
    });
  }

  function handlePromote() {
    setError(null);
    startPromote(async () => {
      try {
        await promoteFrameToObservation(frame.id);
        setPromoted(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "操作失败");
      }
    });
  }

  return (
    <div
      className={`rounded-lg border p-3 sm:p-4 flex flex-col gap-3 transition-opacity ${
        marked ? "ring-2 ring-foreground/20" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1 min-w-0">
          <span
            className={`inline-block self-start rounded-full border px-2 py-0.5 text-[10px] font-medium ${colorClass}`}
          >
            {group} · {FRAME_TYPE_LABELS[frame.frame_type] ?? frame.frame_type}
          </span>
          <p className="text-sm font-medium leading-snug">{frame.title}</p>
        </div>
        <button
          type="button"
          onClick={handleMark}
          disabled={markPending}
          aria-label={marked ? "取消标记" : "标记为有用"}
          className={`mt-0.5 shrink-0 h-5 w-5 rounded border transition-colors ${
            marked
              ? "bg-foreground border-foreground text-background"
              : "border-border hover:border-foreground"
          }`}
        >
          {marked && (
            <svg viewBox="0 0 12 12" fill="none" className="w-full h-full p-0.5">
              <path
                d="M2 6l3 3 5-5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground break-words">
        {frame.description}
      </p>
      <div className="flex items-center gap-2 pt-1 border-t border-border/50">
        {promoted ? (
          <span className="text-xs text-muted-foreground">已升格为观察</span>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={handlePromote}
            disabled={promotePending}
          >
            {promotePending ? "升格中…" : "升格为观察"}
          </Button>
        )}
        {error && <AiErrorNotice error={error} className="text-xs" />}
      </div>
    </div>
  );
}

export function ReframingWorkspace({
  session,
  centralQuestionAvailable,
  realitySource,
}: {
  session: ReframingSessionWithFrames;
  centralQuestionAvailable: boolean;
  realitySource: RealityReasoningSnapshot | null;
}) {
  const router = useRouter();
  const [questions, setQuestions] = useState<CentralQuestionCandidate[]>(
    session.central_question_candidates ?? []
  );
  const [selectedType, setSelectedType] = useState<CentralQuestionType | null>(
    (session.selected_question_type as CentralQuestionType | null) ?? null
  );
  const [selectedQuestion, setSelectedQuestion] = useState(
    session.selected_question ?? ""
  );
  const [questionBusy, setQuestionBusy] = useState(false);
  const [questionError, setQuestionError] = useState<string | null>(null);
  // Sort frames by FRAME_TYPES order
  const orderedFrames = [...session.frames].sort(
    (a, b) =>
      (FRAME_TYPES as readonly string[]).indexOf(a.frame_type) -
      (FRAME_TYPES as readonly string[]).indexOf(b.frame_type)
  );

  const markedCount = session.frames.filter((f) => f.is_marked).length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-2 text-xs text-muted-foreground">
        <Link href="/reasoning" className="hover:underline">
          推理工具
        </Link>{" "}
        / 认知重构
      </div>

      <div className="mb-8">
        <h1 className="text-lg font-semibold leading-snug">{session.topic_text}</h1>
        {session.context_note && (
          <p className="mt-1 text-sm text-muted-foreground">{session.context_note}</p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          {orderedFrames.length} 种视角 · {markedCount > 0 ? `已标记 ${markedCount} 种` : "勾选有用的视角，可升格为观察"}
        </p>
        {realitySource && (
          <div className="mt-4">
            <RealitySourceCard snapshot={realitySource} showLink />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {orderedFrames.map((frame) => (
          <FrameCard key={frame.id} frame={frame} />
        ))}
      </div>

      {centralQuestionAvailable && (
      <section className="mt-10 rounded-xl border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Central Question
            </p>
            <h2 className="mt-2 text-lg font-medium">
              从26个视角，收敛成一个值得回答的问题
            </h2>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground">
              8种问法不评分。它们只说明打开什么空间，以及会改变什么决定。
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={questionBusy}
            onClick={async () => {
              setQuestionBusy(true);
              setQuestionError(null);
              try {
                const result =
                  await generateCentralQuestionsForReframing(session.id);
                setQuestions(result.candidates);
                setSelectedType(null);
                setSelectedQuestion("");
                router.refresh();
              } catch (caught) {
                console.error("生成Central Question失败", caught);
                setQuestionError(
                  caught instanceof Error ? caught.message : "生成失败"
                );
              } finally {
                setQuestionBusy(false);
              }
            }}
          >
            {questionBusy ? "正在收敛…" : "生成8种问法"}
          </Button>
        </div>

        {questions.length > 0 && (
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {questions.map((candidate) => (
              <button
                key={candidate.type}
                type="button"
                onClick={() => {
                  setSelectedType(candidate.type);
                  setSelectedQuestion(candidate.question);
                }}
                className={
                  "rounded-lg border p-4 text-left transition-colors " +
                  (selectedType === candidate.type
                    ? "border-foreground bg-foreground text-background"
                    : "hover:border-foreground/40")
                }
              >
                <div className="font-mono text-[9px] uppercase opacity-50">
                  {QUESTION_TYPE_LABEL[candidate.type]}
                </div>
                <p className="mt-2 text-sm font-medium leading-6">
                  {candidate.question}
                </p>
                <dl className="mt-3 space-y-2 text-xs leading-5 opacity-70">
                  <div>
                    <dt className="font-medium">打开空间</dt>
                    <dd>{candidate.opens_space}</dd>
                  </div>
                  <div>
                    <dt className="font-medium">改变决定</dt>
                    <dd>{candidate.decision_impact}</dd>
                  </div>
                </dl>
              </button>
            ))}
          </div>
        )}

        {selectedType && (
          <div className="mt-5 border-t pt-5">
            <label className="text-xs text-muted-foreground">
              当前唯一问题（可以改写）
              <textarea
                value={selectedQuestion}
                onChange={(event) => setSelectedQuestion(event.target.value)}
                className="mt-2 min-h-24 w-full rounded-md border bg-background p-3 text-sm leading-6 text-foreground"
              />
            </label>
            <Button
              type="button"
              className="mt-3"
              disabled={questionBusy || !selectedQuestion.trim()}
              onClick={async () => {
                setQuestionBusy(true);
                setQuestionError(null);
                try {
                  await selectReframingCentralQuestion(
                    session.id,
                    selectedType,
                    selectedQuestion
                  );
                  router.refresh();
                } catch (caught) {
                  console.error("保存Central Question失败", caught);
                  setQuestionError(
                    caught instanceof Error ? caught.message : "保存失败"
                  );
                } finally {
                  setQuestionBusy(false);
                }
              }}
            >
              保存为当前Central Question
            </Button>
          </div>
        )}

        <AiErrorNotice error={questionError} className="mt-3" />
      </section>
      )}
    </div>
  );
}

const QUESTION_TYPE_LABEL: Record<CentralQuestionType, string> = {
  whole: "全体の問",
  subjective: "主観の問",
  ideal: "理想の問",
  verb: "動詞の問",
  destruction: "破壊の問",
  purpose: "目的の問",
  altruistic: "利他の問",
  freedom: "自由の問",
};
