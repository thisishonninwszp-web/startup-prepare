"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowLeft,
  Check,
  GitBranch,
  MapPin,
  PencilLine,
  ScanSearch,
  Sparkles,
  Split,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiErrorNotice } from "@/components/ai-error-notice";
import {
  acceptDreamBranchSuggestion,
  answerDreamTurn,
  archiveDreamBranch,
  attachRealityToDream,
  createDreamVersion,
  deleteDreamCanvasItem,
  focusDreamBranch,
  generateDreamBranchSuggestions,
  rejectDreamBranchSuggestion,
  resolveDreamInference,
  saveDreamCanvasItem,
} from "../actions";
import type {
  DreamCaseDetail,
  listRealityVersionChoices,
} from "../queries";
import type { DreamCanvasDimension } from "../types";

type RealityChoice = Awaited<
  ReturnType<typeof listRealityVersionChoices>
>[number];

const CONTEXT_LABEL = {
  personal: "人生",
  business: "事业",
  cross: "人生／事业交叉",
} as const;
const SCALE_LABEL = {
  small: "小梦 · 1年内",
  big: "大梦 · 3–5年",
  grand: "宏大梦 · 10年以上",
} as const;
const PHASES = [
  ["memory_bridge", "真实片段"],
  ["future_day", "未来一天"],
  ["people", "人物关系"],
  ["inner_state", "内在感受"],
  ["meaning", "意义变化"],
  ["non_negotiables", "不可牺牲"],
  ["fork_point", "未来分叉"],
] as const;

const CANVAS_SECTIONS: {
  title: string;
  dimensions: { key: DreamCanvasDimension; label: string }[];
  folded?: boolean;
}[] = [
  {
    title: "未来一天",
    dimensions: [
      { key: "scene_title", label: "这一幕的名字" },
      { key: "horizon", label: "什么时候" },
      { key: "location", label: "在哪里" },
      { key: "people", label: "谁在身边" },
      { key: "sensory_details", label: "看见与听见" },
      { key: "actions", label: "正在做什么" },
      { key: "inner_state", label: "内在状态" },
      { key: "desired_changes", label: "真正发生的变化" },
    ],
  },
  {
    title: "它靠什么成立",
    folded: true,
    dimensions: [
      { key: "past_roots", label: "过去为何在意" },
      { key: "non_negotiables", label: "不愿牺牲" },
      { key: "costs", label: "愿意承担的代价" },
      { key: "assumptions", label: "成立前提" },
      { key: "reality_signals", label: "现实信号" },
      { key: "conflicts", label: "人生／事业冲突" },
    ],
  },
];

export function DreamWorkspace({
  initialCase,
  realityChoices,
}: {
  initialCase: DreamCaseDetail;
  realityChoices: RealityChoice[];
}) {
  const router = useRouter();
  const [activeBranchId, setActiveBranchId] = useState(
    initialCase.focused_branch?.id ?? initialCase.branches[0]?.id ?? ""
  );
  const activeBranch =
    initialCase.branches.find((branch) => branch.id === activeBranchId) ??
    initialCase.focused_branch ??
    initialCase.branches[0];
  const [answer, setAnswer] = useState("");
  const answerKey = useRef("");
  const [changeReason, setChangeReason] = useState("");
  const [realityVersionId, setRealityVersionId] = useState("");
  const [realityScope, setRealityScope] = useState<"case" | "branch">(
    "branch"
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const phaseIndex = Math.max(
    0,
    PHASES.findIndex(([phase]) => phase === activeBranch?.phase)
  );

  function run(
    key: string,
    action: () => Promise<unknown>,
    success: string,
    clear?: () => void
  ) {
    setBusy(key);
    setError(null);
    setNotice(null);
    void action()
      .then(() => {
        clear?.();
        setNotice(success);
        router.refresh();
      })
      .catch((caught) => {
        console.error(`梦想操作失败：${key}`, caught);
        setError(caught instanceof Error ? caught.message : "操作失败");
        router.refresh();
      })
      .finally(() => setBusy(null));
  }

  if (!activeBranch || !activeBranch.canvas) {
    return (
      <main className="min-h-screen bg-[#f4f1ea] p-8 text-foreground">
        <p>梦想分支尚未完成初始化，请确认011迁移已经执行。</p>
      </main>
    );
  }

  const canvas = activeBranch.canvas;

  return (
    <main className="min-h-screen bg-[#f4f1ea] text-foreground">
      <header className="border-b border-border bg-[#f9f7f2] px-4 py-6 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-[90rem]">
          <div className="flex items-center justify-between gap-4">
            <Link
              href="/dreams"
              className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-3" />
              返回未来档案
            </Link>
            {initialCase.branches.length >= 2 ? (
              <Link
                href={`/dreams/${initialCase.id}/compare`}
                className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <Split className="size-3.5" />
                并排比较未来
              </Link>
            ) : null}
          </div>

          <div className="mt-6 flex flex-wrap items-end justify-between gap-5">
            <div>
              <div className="flex gap-2 text-[10px] text-muted-foreground">
                <span className="rounded-full border border-border px-2 py-1">
                  {CONTEXT_LABEL[initialCase.context]}
                </span>
                <span className="rounded-full border border-border px-2 py-1">
                  {SCALE_LABEL[initialCase.scale]}
                </span>
              </div>
              <h1 className="mt-4 font-serif text-3xl tracking-[-0.04em] sm:text-4xl">
                {initialCase.title}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {initialCase.initial_desire}
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/80">
                Canvas revision
              </p>
              <p className="mt-1 font-serif text-2xl">
                {String(canvas.revision).padStart(2, "0")}
              </p>
            </div>
          </div>

          <div className="mt-7 flex gap-2 overflow-x-auto pb-1">
            {initialCase.branches.map((branch, index) => (
              <button
                key={branch.id}
                type="button"
                onClick={() => setActiveBranchId(branch.id)}
                className={
                  "group flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-xs transition-colors " +
                  (branch.id === activeBranch.id
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-white/60 hover:border-foreground/30")
                }
              >
                <span className="font-mono opacity-55">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {branch.name}
                {branch.is_focused ? (
                  <Star className="size-3 fill-current" />
                ) : null}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[90rem] gap-6 px-4 py-6 sm:px-8 lg:grid-cols-[minmax(20rem,.78fr)_minmax(0,1.22fr)] lg:px-12">
        <section className="space-y-5 lg:sticky lg:top-5 lg:self-start">
          <div className="overflow-hidden rounded-[2rem] border border-border bg-foreground text-background">
            <div className="border-b border-white/10 px-6 py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/80">
                  One question at a time
                </p>
                <span className="text-[10px] text-muted-foreground/80">
                  {phaseIndex + 1} / {PHASES.length}
                </span>
              </div>
              <div className="mt-3 flex gap-1">
                {PHASES.map(([phase], index) => (
                  <span
                    key={phase}
                    className={
                      "h-1 flex-1 rounded-full " +
                      (index <= phaseIndex ? "bg-muted" : "bg-white/15")
                    }
                  />
                ))}
              </div>
            </div>
            <div className="p-6 sm:p-7">
              <p className="text-xs text-muted-foreground/80">
                {PHASES[phaseIndex]?.[1]}
              </p>
              <h2 className="mt-4 font-serif text-2xl leading-9">
                {activeBranch.current_question}
              </h2>
              <textarea
                value={answer}
                onChange={(event) => {
                  setAnswer(event.target.value);
                  answerKey.current = crypto.randomUUID();
                }}
                placeholder="只写你真实看见、记得或在意的部分……"
                className="mt-6 min-h-32 w-full rounded-lg border border-white/15 bg-white/5 p-4 text-sm leading-7 text-primary-foreground outline-none placeholder:text-muted-foreground focus:border-white/40"
              />
              <Button
                type="button"
                className="mt-3 w-full rounded-full bg-muted/50 text-foreground hover:bg-white"
                disabled={!answer.trim() || busy === "answer"}
                onClick={() =>
                  run(
                    "answer",
                    () =>
                      answerDreamTurn({
                        caseId: initialCase.id,
                        branchId: activeBranch.id,
                        answer,
                        idempotencyKey:
                          answerKey.current || crypto.randomUUID(),
                        expectedRevision: canvas.revision,
                      }),
                    "你的回答已进入画布，下一道问题已经准备好。",
                    () => {
                      setAnswer("");
                      answerKey.current = "";
                    }
                  )
                }
              >
                {busy === "answer" ? "正在整理原话…" : "回答并看下一题"}
              </Button>
              <p className="mt-3 text-center text-[10px] leading-4 text-muted-foreground">
                回答会先保存。即使AI暂时失败，你写下的内容也不会丢失。
              </p>
            </div>
          </div>

          <details className="rounded-lg border border-border bg-[#f9f7f2] p-5">
            <summary className="cursor-pointer text-sm font-medium">
              查看这条路径的访谈记录
            </summary>
            <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
              {activeBranch.messages.map((message) => (
                <div
                  key={message.id}
                  className={
                    "rounded-lg p-3 text-xs leading-5 " +
                    (message.role === "user"
                      ? "ml-5 bg-foreground text-background"
                      : "mr-5 bg-muted/70 text-foreground")
                  }
                >
                  {message.content}
                </div>
              ))}
            </div>
          </details>

          <BranchControls
            dreamCase={initialCase}
            activeBranch={activeBranch}
            busy={busy}
            run={run}
          />

          <section className="rounded-lg border border-border bg-[#f9f7f2] p-5">
            <div className="flex items-center gap-2">
              <ScanSearch className="size-4" />
              <h2 className="text-sm font-medium">连接现状</h2>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              只进入前提、代价、信号和冲突，不改写未来场景。
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {(["branch", "case"] as const).map((scope) => (
                <button
                  key={scope}
                  type="button"
                  onClick={() => setRealityScope(scope)}
                  className={
                    "rounded-full border px-3 py-2 text-xs " +
                    (realityScope === scope
                      ? "border-foreground/30 bg-foreground text-primary-foreground"
                      : "border-border")
                  }
                >
                  {scope === "branch" ? "只用于当前路径" : "用于全部路径"}
                </button>
              ))}
            </div>
            <select
              value={realityVersionId}
              onChange={(event) => setRealityVersionId(event.target.value)}
              className="mt-3 w-full rounded-lg border border-border bg-white px-3 py-2 text-xs"
            >
              <option value="">选择现状地图</option>
              {realityChoices.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.case_title} · v{choice.version_no}
                </option>
              ))}
            </select>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2 w-full rounded-full"
              disabled={!realityVersionId || busy === "reality"}
              onClick={() =>
                run(
                  "reality",
                  () =>
                    attachRealityToDream(
                      initialCase.id,
                      realityVersionId,
                      realityScope,
                      realityScope === "branch" ? activeBranch.id : undefined
                    ),
                  "现状地图已连接，只会影响下一版现实折叠区。"
                )
              }
            >
              <MapPin className="mr-2 size-3.5" />
              保存现实来源
            </Button>
          </section>

          {error ? (
            <AiErrorNotice error={error} className="rounded-lg text-xs leading-5" />
          ) : notice ? (
            <p className="rounded-lg border border-status-mvp/30 bg-status-mvp/10 p-3 text-xs leading-5 text-status-mvp">
              {notice}
            </p>
          ) : null}
        </section>

        <section className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Live future canvas
              </p>
              <h2 className="mt-1 font-serif text-2xl">
                {activeBranch.name}
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {activeBranch.versions.length ? (
                <Link
                  href={`/dreams/${initialCase.id}/branches/${activeBranch.id}/versions/${activeBranch.versions[0].version_no}`}
                  className="inline-flex h-9 items-center rounded-full border border-border bg-white px-4 text-xs"
                >
                  查看版本 v{activeBranch.versions[0].version_no}
                </Link>
              ) : null}
              <Button
                type="button"
                className="rounded-full"
                disabled={busy === "version"}
                onClick={() =>
                  run(
                    "version",
                    () =>
                      createDreamVersion(
                        initialCase.id,
                        activeBranch.id,
                        changeReason
                      ),
                    "已保存不可覆盖的场景版本。",
                    () => setChangeReason("")
                  )
                }
              >
                <Sparkles className="mr-2 size-4" />
                保存场景版本
              </Button>
            </div>
          </div>
          {activeBranch.versions.length ? (
            <input
              value={changeReason}
              onChange={(event) => setChangeReason(event.target.value)}
              placeholder="这次为什么改变（可选）"
              className="w-full rounded-full border border-border bg-white/70 px-4 py-2 text-xs"
            />
          ) : null}

          <DreamCanvasEditor
            caseId={initialCase.id}
            branchId={activeBranch.id}
            canvas={canvas}
            pendingInferences={activeBranch.pending_inferences}
            busy={busy}
            run={run}
          />
        </section>
      </div>
    </main>
  );
}

function DreamCanvasEditor({
  caseId,
  branchId,
  canvas,
  pendingInferences,
  busy,
  run,
}: {
  caseId: string;
  branchId: string;
  canvas: NonNullable<DreamCaseDetail["branches"][number]["canvas"]>;
  pendingInferences: DreamCaseDetail["branches"][number]["pending_inferences"];
  busy: string | null;
  run: (
    key: string,
    action: () => Promise<unknown>,
    success: string,
    clear?: () => void
  ) => void;
}) {
  const [adding, setAdding] = useState<DreamCanvasDimension | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const suggestionByItem = useMemo(
    () =>
      new Map(
        pendingInferences.map((suggestion) => [
          suggestion.canvas_item_id as string,
          suggestion,
        ])
      ),
    [pendingInferences]
  );

  return (
    <div className="space-y-5">
      {CANVAS_SECTIONS.map((section) => {
        const body = (
          <div className="grid gap-3 sm:grid-cols-2">
            {section.dimensions.map((dimension) => {
              const items = canvas.content[dimension.key];
              return (
                <article
                  key={dimension.key}
                  className="group rounded-lg border border-border/80 bg-white/55 p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-medium text-muted-foreground">
                      {dimension.label}
                    </h4>
                    <button
                      type="button"
                      className="rounded-full p-1 text-muted-foreground/80 hover:bg-muted hover:text-foreground"
                      onClick={() => {
                        setAdding(dimension.key);
                        setEditingItemId(null);
                        setDraft("");
                      }}
                    >
                      <PencilLine className="size-3.5" />
                    </button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {items.length ? (
                      items.map((item) => {
                        const suggestion = suggestionByItem.get(item.id);
                        return (
                          <div
                            key={item.id}
                            className={
                              "rounded-lg border p-3 " +
                              (item.status === "pending"
                                ? "border-status-validating/30 bg-status-validating/10"
                                : "border-transparent bg-[#f4f1ea]")
                            }
                          >
                            <p className="text-sm leading-6">{item.text}</p>
                            <div className="mt-2 flex items-center justify-between gap-2">
                              <span className="text-[10px] text-muted-foreground">
                                {item.status === "pending"
                                  ? "AI推演 · 待确认"
                                  : item.origin === "explicit"
                                    ? "来自你的原话"
                                    : item.origin === "legacy"
                                      ? "旧愿景迁移"
                                      : "你确认的内容"}
                              </span>
                              <div className="flex gap-1">
                                {!suggestion ? (
                                  <button
                                    type="button"
                                    aria-label="修改画布内容"
                                    className="rounded-full p-1 text-muted-foreground/80 hover:bg-muted hover:text-foreground"
                                    disabled={Boolean(busy)}
                                    onClick={() => {
                                      setAdding(dimension.key);
                                      setEditingItemId(item.id);
                                      setDraft(item.text);
                                    }}
                                  >
                                    <PencilLine className="size-3" />
                                  </button>
                                ) : null}
                                {suggestion ? (
                                  <>
                                    <button
                                      type="button"
                                      aria-label="确认AI推演"
                                      className="rounded-full bg-status-mvp/15 p-1 text-status-mvp"
                                      disabled={Boolean(busy)}
                                      onClick={() =>
                                        run(
                                          `accept-${item.id}`,
                                          () =>
                                            resolveDreamInference({
                                              caseId,
                                              branchId,
                                              suggestionId:
                                                suggestion.id as string,
                                              resolution: "accept",
                                              expectedRevision:
                                                canvas.revision,
                                            }),
                                          "已确认这条画布内容。"
                                        )
                                      }
                                    >
                                      <Check className="size-3" />
                                    </button>
                                    <button
                                      type="button"
                                      aria-label="拒绝AI推演"
                                      className="rounded-full bg-muted p-1 text-muted-foreground"
                                      disabled={Boolean(busy)}
                                      onClick={() =>
                                        run(
                                          `reject-${item.id}`,
                                          () =>
                                            resolveDreamInference({
                                              caseId,
                                              branchId,
                                              suggestionId:
                                                suggestion.id as string,
                                              resolution: "reject",
                                              expectedRevision:
                                                canvas.revision,
                                            }),
                                          "已移除这条AI推演。"
                                        )
                                      }
                                    >
                                      <X className="size-3" />
                                    </button>
                                  </>
                                ) : null}
                                {!suggestion ? (
                                  <button
                                    type="button"
                                    aria-label="删除画布内容"
                                    className="rounded-full p-1 text-muted-foreground/80 hover:bg-destructive/15 hover:text-destructive"
                                    disabled={Boolean(busy)}
                                    onClick={() =>
                                      run(
                                        `delete-${item.id}`,
                                        () =>
                                          deleteDreamCanvasItem({
                                            caseId,
                                            branchId,
                                            dimension: dimension.key,
                                            itemId: item.id,
                                            expectedRevision: canvas.revision,
                                          }),
                                        "画布内容已删除。"
                                      )
                                    }
                                  >
                                    <Trash2 className="size-3" />
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p className="py-3 font-serif text-sm italic text-muted-foreground/80">
                        尚未看清
                      </p>
                    )}
                    {adding === dimension.key ? (
                      <div className="space-y-2">
                        <textarea
                          autoFocus
                          value={draft}
                          onChange={(event) => setDraft(event.target.value)}
                          className="min-h-20 w-full rounded-lg border border-border bg-white p-3 text-sm"
                          placeholder="用自己的话补充……"
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="rounded-full"
                            disabled={!draft.trim() || Boolean(busy)}
                            onClick={() =>
                              run(
                                `add-${dimension.key}`,
                                () =>
                                  saveDreamCanvasItem({
                                    caseId,
                                    branchId,
                                    dimension: dimension.key,
                                    itemId: editingItemId,
                                    text: draft,
                                    expectedRevision: canvas.revision,
                                  }),
                                "画布内容已保存。",
                                () => {
                                  setDraft("");
                                  setAdding(null);
                                  setEditingItemId(null);
                                }
                              )
                            }
                          >
                            保存
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setAdding(null);
                              setEditingItemId(null);
                            }}
                          >
                            取消
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        );
        return section.folded ? (
          <details
            key={section.title}
            className="rounded-[2rem] border border-border bg-[#f9f7f2] p-5 sm:p-6"
          >
            <summary className="cursor-pointer font-serif text-xl">
              {section.title}
            </summary>
            <p className="mt-2 text-xs text-muted-foreground">
              现实只在这里与梦想相遇，不会改写上面的场景。
            </p>
            <div className="mt-5">{body}</div>
          </details>
        ) : (
          <section
            key={section.title}
            className="rounded-[2rem] border border-border bg-[#f9f7f2] p-5 sm:p-6"
          >
            <div className="flex items-end justify-between gap-4">
              <h3 className="font-serif text-2xl">{section.title}</h3>
              <p className="text-[10px] text-muted-foreground/80">
                原话自动显影 · 推演必须确认
              </p>
            </div>
            <div className="mt-5">{body}</div>
          </section>
        );
      })}
    </div>
  );
}

function BranchControls({
  dreamCase,
  activeBranch,
  busy,
  run,
}: {
  dreamCase: DreamCaseDetail;
  activeBranch: DreamCaseDetail["branches"][number];
  busy: string | null;
  run: (
    key: string,
    action: () => Promise<unknown>,
    success: string,
    clear?: () => void
  ) => void;
}) {
  return (
    <section className="rounded-lg border border-border bg-[#f9f7f2] p-5">
      <div className="flex items-center gap-2">
        <GitBranch className="size-4" />
        <h2 className="text-sm font-medium">未来分支</h2>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        AI只能从你已经表达的真实取舍中提出分叉，不会替你选择。
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          size="sm"
          variant="outline"
          className="rounded-full"
          disabled={Boolean(busy) || dreamCase.branches.length >= 5}
          onClick={() =>
            run(
              "suggest-branches",
              () =>
                generateDreamBranchSuggestions(
                  dreamCase.id,
                  activeBranch.id
                ),
              "分支建议已更新。"
            )
          }
        >
          <GitBranch className="mr-1 size-3.5" />
          发现分叉
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="rounded-full"
          disabled={Boolean(busy) || activeBranch.is_focused}
          onClick={() =>
            run(
              "focus",
              () => focusDreamBranch(dreamCase.id, activeBranch.id),
              "已设为当前想继续看的未来。"
            )
          }
        >
          <Star className="mr-1 size-3.5" />
          设为焦点
        </Button>
      </div>
      {activeBranch.suggestions.length ? (
        <div className="mt-4 space-y-2">
          {activeBranch.suggestions.map((suggestion) => (
            <div
              key={suggestion.id}
              className="rounded-lg border border-border bg-white p-3"
            >
              <p className="text-sm font-medium">{suggestion.label}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {suggestion.fork_question}
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                取舍：{suggestion.tradeoff}
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  className="rounded-full"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    run(
                      `branch-${suggestion.id}`,
                      () =>
                        acceptDreamBranchSuggestion(
                          dreamCase.id,
                          suggestion.id as string
                        ),
                      "新的未来分支已经创建。"
                    )
                  }
                >
                  创建这条路径
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    run(
                      `reject-branch-${suggestion.id}`,
                      () =>
                        rejectDreamBranchSuggestion(
                          dreamCase.id,
                          suggestion.id as string
                        ),
                      "已忽略这条分支建议。"
                    )
                  }
                >
                  忽略
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {dreamCase.branches.length > 1 ? (
        <button
          type="button"
          disabled={Boolean(busy)}
          className="mt-4 inline-flex items-center gap-1 text-[10px] text-muted-foreground/80 hover:text-destructive"
          onClick={() =>
            run(
              "archive",
              () => archiveDreamBranch(dreamCase.id, activeBranch.id),
              "分支已归档，历史版本仍然保留。"
            )
          }
        >
          <Archive className="size-3" />
          归档当前分支
        </button>
      ) : null}
    </section>
  );
}
