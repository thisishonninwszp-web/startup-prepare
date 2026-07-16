"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowLeft,
  ChevronDown,
  FileText,
  LoaderCircle,
  RefreshCcw,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiErrorNotice } from "@/components/ai-error-notice";
import {
  archiveRealityCase,
  askRealityQuestion,
  generateRealityVersion,
  selectRealityPath,
} from "../actions";
import {
  REALITY_INTERVIEW_SOFT_LIMIT,
  type RealityMessage,
} from "../types";
import type { RealityCaseDetail } from "../queries";
import type { RealityClosure } from "../closure";
import { RealityMapView } from "./reality-map";
import { RealityClosurePanel } from "./closure-panel";
import {
  FocusedInquiryPanel,
  type FocusRequest,
} from "./focused-inquiry-panel";
import type { RealityFocusSession } from "../focus";
import { RealityDecisionClosurePanel } from "@/lib/domains/closures/decision-closure-panel";
import type { DecisionClosure } from "@/lib/domains/closures/domain";

const CONTEXT_LABEL = {
  personal: "人生",
  business: "事业",
  cross: "人生 × 事业",
} as const;

export function RealityWorkspace({
  initialCase,
  reasoningBridgeAvailable,
  closureAvailable,
  closures,
  focusAvailable,
  focusSessions,
  decisionClosureAvailable,
  decisionClosures,
}: {
  initialCase: RealityCaseDetail;
  reasoningBridgeAvailable: boolean;
  closureAvailable: boolean;
  closures: RealityClosure[];
  focusAvailable: boolean;
  focusSessions: RealityFocusSession[];
  decisionClosureAvailable: boolean;
  decisionClosures: DecisionClosure[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<RealityMessage[]>(
    initialCase.messages
  );
  const [answer, setAnswer] = useState("");
  const [asking, setAsking] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(initialCase.versions.length > 0);
  const [softLimit, setSoftLimit] = useState(
    initialCase.messages.filter((message) => message.role === "assistant")
      .length >= REALITY_INTERVIEW_SOFT_LIMIT
  );
  const [updateContext, setUpdateContext] = useState("");
  const [selectedVersionId, setSelectedVersionId] = useState(
    initialCase.versions[0]?.id ?? ""
  );
  const [pathIndex, setPathIndex] = useState<number | null>(null);
  const [customAction, setCustomAction] = useState("");
  const [selectionReason, setSelectionReason] = useState("");
  const [reviewDueAt, setReviewDueAt] = useState(defaultReviewDate());
  const [savingPath, setSavingPath] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);

  const selectedVersion =
    initialCase.versions.find((version) => version.id === selectedVersionId) ??
    initialCase.versions[0];
  const assistantTurns = messages.filter(
    (message) => message.role === "assistant"
  ).length;
  const hasStarted = assistantTurns > 0;
  const latestVersionId = initialCase.versions[0]?.id;

  const sourceRows = useMemo(
    () =>
      initialCase.sources.filter(
        (source): source is Record<string, unknown> =>
          !!source && typeof source === "object"
      ),
    [initialCase.sources]
  );

  async function ask(forceContinue = false) {
    if (asking) return;
    setAsking(true);
    setError(null);
    try {
      const result = await askRealityQuestion(
        initialCase.id,
        hasStarted ? answer : "",
        forceContinue
      );
      setMessages(result.messages);
      setReady(result.readyToSynthesize);
      setSoftLimit(result.softLimitReached);
      setAnswer("");
    } catch (caught) {
      console.error("现状认识追问失败", caught);
      setError(caught instanceof Error ? caught.message : "AI追问失败，请重试");
    } finally {
      setAsking(false);
    }
  }

  async function generateVersion() {
    if (generating) return;
    setGenerating(true);
    setError(null);
    try {
      const versionId = await generateRealityVersion(
        initialCase.id,
        updateContext
      );
      setSelectedVersionId(versionId);
      setUpdateContext("");
      router.refresh();
    } catch (caught) {
      console.error("生成现状地图失败", caught);
      setError(
        caught instanceof Error ? caught.message : "现状地图生成失败，请重试"
      );
    } finally {
      setGenerating(false);
    }
  }

  async function savePath() {
    if (pathIndex === null || !selectedVersion) return;
    setSavingPath(true);
    setError(null);
    try {
      await selectRealityPath(selectedVersion.id, {
        pathIndex,
        customAction,
        reason: selectionReason,
        reviewDueAt,
      });
      setPathIndex(null);
      router.refresh();
    } catch (caught) {
      console.error("保存现状路径失败", caught);
      setError(caught instanceof Error ? caught.message : "路径保存失败");
    } finally {
      setSavingPath(false);
    }
  }

  async function archiveCase() {
    setError(null);
    try {
      await archiveRealityCase(initialCase.id);
      router.push("/reality");
      router.refresh();
    } catch (caught) {
      console.error("归档现状课题失败", caught);
      setError(caught instanceof Error ? caught.message : "归档失败，请重试");
    }
  }

  return (
    <div>
      <header className="border-b bg-card px-4 py-6 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-6xl">
          <Link
            href="/reality"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" />
            返回现状课题
          </Link>
          <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                <span className="rounded-full border px-2 py-0.5">
                  {initialCase.mode === "global" ? "全局扫描" : "具体课题"}
                </span>
                <span className="rounded-full bg-muted px-2 py-0.5">
                  {CONTEXT_LABEL[initialCase.context]}
                </span>
                {initialCase.domains.map((domain) => (
                  <span key={domain} className="rounded-full bg-muted px-2 py-0.5">
                    {domain}
                  </span>
                ))}
              </div>
              <h1 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">
                {initialCase.title}
              </h1>
              <p className="mt-3 max-w-2xl whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                {initialCase.initial_statement}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setArchiveOpen((value) => !value)}
              className="inline-flex items-center gap-2 self-start rounded-md border px-3 py-2 text-xs text-muted-foreground hover:bg-muted"
            >
              <Archive className="size-3.5" />
              归档课题
            </button>
          </div>
          {archiveOpen && (
            <div className="mt-4 flex items-center justify-between gap-4 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              <span>归档后不再出现在课题列表中，历史版本仍保留。</span>
              <button
                type="button"
                onClick={archiveCase}
                className="shrink-0 font-medium underline underline-offset-4"
              >
                确认归档
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:px-12">
        <div className="min-w-0 space-y-12">
          {decisionClosureAvailable && initialCase.versions[0] && (
            <RealityDecisionClosurePanel
              caseId={initialCase.id}
              versionId={initialCase.versions[0].id}
              closures={decisionClosures}
            />
          )}

          {closureAvailable && initialCase.versions[0] && (
            <RealityClosurePanel
              caseId={initialCase.id}
              latestVersion={initialCase.versions[0]}
              closures={closures}
            />
          )}

          <section>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Diagnostic interview
                </p>
                <h2 className="mt-1 text-lg font-medium">诊断式访谈</h2>
              </div>
              <span className="font-mono text-xs text-muted-foreground">
                {assistantTurns} / {REALITY_INTERVIEW_SOFT_LIMIT} 轮
              </span>
            </div>

            {!hasStarted ? (
              <div className="rounded-lg border bg-card p-6">
                <p className="text-sm leading-6">
                  AI会逐轮检查依据、替代解释、未知、约束和情绪影响。每轮只问少量关键问题。
                </p>
                <Button
                  type="button"
                  onClick={() => ask()}
                  disabled={asking}
                  className="mt-5 gap-2"
                >
                  {asking ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  开始第一轮追问
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="max-h-[34rem] space-y-3 overflow-y-auto rounded-lg border bg-muted/20 p-4">
                  {messages.slice(1).map((message, index) => (
                    <div
                      key={`${message.created_at}-${index}`}
                      className={
                        "max-w-[90%] rounded-md p-3 text-sm leading-6 " +
                        (message.role === "assistant"
                          ? "bg-card shadow-sm"
                          : "ml-auto bg-foreground text-background")
                      }
                    >
                      <div className="mb-1 font-mono text-[9px] uppercase tracking-wider opacity-50">
                        {message.role === "assistant" ? "追问" : "你的回答"}
                      </div>
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    </div>
                  ))}
                </div>

                {!softLimit ? (
                  <div className="space-y-2">
                    <textarea
                      value={answer}
                      onChange={(event) => setAnswer(event.target.value)}
                      rows={4}
                      placeholder="回答最近一轮问题。没有事实就明确写“不知道”。"
                      className="w-full resize-y rounded-md border bg-card px-3 py-3 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        type="button"
                        onClick={() => ask()}
                        disabled={asking || !answer.trim()}
                      >
                        {asking ? "追问中…" : "提交并继续追问"}
                      </Button>
                      {(ready || assistantTurns >= 2) && (
                        <button
                          type="button"
                          onClick={generateVersion}
                          disabled={generating}
                          className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                        >
                          先基于现有信息生成地图
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border bg-card p-5">
                    <p className="text-sm font-medium">已到6轮建议上限</p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      先生成地图通常更有用。你也可以明确继续一轮，但不要让分析替代现实行动。
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <Button
                        type="button"
                        onClick={generateVersion}
                        disabled={generating}
                      >
                        {generating ? "生成中…" : "生成现状地图"}
                      </Button>
                      <button
                        type="button"
                        onClick={() => ask(true)}
                        disabled={asking}
                        className="rounded-md border px-3 py-2 text-xs hover:bg-muted"
                      >
                        再继续一轮
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          {initialCase.versions.length > 0 && (
            <section>
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    Versioned reality map
                  </p>
                  <h2 className="mt-1 text-lg font-medium">现状地图</h2>
                </div>
                <label className="relative">
                  <select
                    value={selectedVersion?.id}
                    onChange={(event) => setSelectedVersionId(event.target.value)}
                    className="appearance-none rounded-md border bg-card py-2 pl-3 pr-8 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {initialCase.versions.map((version) => (
                      <option key={version.id} value={version.id}>
                        版本 {version.version_no} ·{" "}
                        {new Date(version.created_at).toLocaleDateString("zh-CN")}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-2.5 size-3" />
                </label>
              </div>

              {selectedVersion && (
                <>
                  <div className="mb-5 flex justify-end">
                    <Link
                      href={`/reality/${initialCase.id}/versions/${selectedVersion.id}`}
                      className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                    >
                      单独查看这个版本
                    </Link>
                  </div>
                  <RealityMapView
                    map={selectedVersion.map}
                    delta={selectedVersion.delta}
                    selectedPath={selectedVersion.selected_path}
                    customAction={selectedVersion.custom_action}
                    selectionReason={selectedVersion.selection_reason}
                    reviewDueAt={selectedVersion.review_due_at}
                    versionId={selectedVersion.id}
                    reasoningBridgeAvailable={reasoningBridgeAvailable}
                    onExplore={
                      focusAvailable
                        ? (locator) =>
                            setFocusRequest({
                              versionId: selectedVersion.id,
                              locator,
                            })
                        : undefined
                    }
                    onSelectPath={
                      selectedVersion.id === latestVersionId
                        ? (index) => {
                            setPathIndex(index);
                            setCustomAction(selectedVersion.map.paths[index].action);
                          }
                        : undefined
                    }
                  />
                </>
              )}
            </section>
          )}

          {pathIndex !== null && selectedVersion && (
            <section className="rounded-lg border-2 border-foreground bg-card p-5">
              <h2 className="text-sm font-medium">确认初步方向</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                这还不是最终行动。完成必要分析后，再在页面顶部收束成唯一下一步。
              </p>
              <div className="mt-5 space-y-4">
                <label className="block">
                  <span className="text-xs text-muted-foreground">行动</span>
                  <textarea
                    value={customAction}
                    onChange={(event) => setCustomAction(event.target.value)}
                    rows={3}
                    className="mt-1 w-full resize-y rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-muted-foreground">为什么选择它</span>
                  <textarea
                    value={selectionReason}
                    onChange={(event) => setSelectionReason(event.target.value)}
                    rows={2}
                    className="mt-1 w-full resize-y rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </label>
                <label className="block max-w-xs">
                  <span className="text-xs text-muted-foreground">复查日期</span>
                  <input
                    type="date"
                    value={reviewDueAt}
                    onChange={(event) => setReviewDueAt(event.target.value)}
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </label>
                <div className="flex gap-3">
                  <Button
                    type="button"
                    onClick={savePath}
                    disabled={savingPath}
                  >
                    {savingPath ? "保存中…" : "确认初步方向"}
                  </Button>
                  <button
                    type="button"
                    onClick={() => setPathIndex(null)}
                    className="text-xs text-muted-foreground"
                  >
                    取消
                  </button>
                </div>
              </div>
            </section>
          )}

          {initialCase.versions.length > 0 && (
            <section className="rounded-lg border bg-muted/30 p-5">
              <div className="flex items-center gap-2">
                <RefreshCcw className="size-4" />
                <h2 className="text-sm font-medium">现实发生变化了吗？</h2>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                写下新事实、上次路径结果和变化原因。新地图会作为不可覆盖的版本保存，并与上一版比较。
              </p>
              <textarea
                value={updateContext}
                onChange={(event) => setUpdateContext(event.target.value)}
                rows={4}
                placeholder="发生了什么变化？上次选择的行动做了吗？结果是什么？"
                className="mt-4 w-full resize-y rounded-md border bg-card px-3 py-3 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button
                type="button"
                onClick={generateVersion}
                disabled={generating || !updateContext.trim()}
                className="mt-3 gap-2"
              >
                {generating ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <RefreshCcw className="size-4" />
                )}
                生成新版本并比较
              </Button>
            </section>
          )}

          <AiErrorNotice error={error} />
        </div>

        <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          {focusAvailable && (
            <FocusedInquiryPanel
              caseId={initialCase.id}
              initialSessions={focusSessions}
              request={focusRequest}
              onClose={() => setFocusRequest(null)}
            />
          )}
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2">
              <FileText className="size-4" />
              <h2 className="text-xs font-medium">引用来源</h2>
            </div>
            {sourceRows.length === 0 ? (
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                本课题没有引用历史记录。地图中的事实只能来自你的访谈回答。
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {sourceRows.map((source, index) => (
                  <div key={index} className="border-t pt-3 first:border-0 first:pt-0">
                    <div className="text-xs font-medium">
                      {String(source.label ?? "来源")}
                    </div>
                    <p className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">
                      {String(source.content ?? "")}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function defaultReviewDate() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
}
