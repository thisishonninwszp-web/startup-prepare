"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  LoaderCircle,
  RotateCcw,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiErrorNotice } from "@/components/ai-error-notice";
import {
  prepareRealityClosure,
  reconfirmRealityClosure,
  resolveRealityClosure,
  saveRealityClosure,
} from "../closure-actions";
import {
  closureNeedsReconfirmation,
  isClosureDue,
  mergeClosureDraftKeepingEdits,
  pathTypeToClosureMode,
  type RealityClosure,
  type RealityClosureDraft,
  type RealityClosureEditableField,
} from "../closure";
import type { RealityVersion } from "../types";

const MODE_LABEL = {
  act: "行动",
  verify: "验证",
  wait: "暂缓",
} as const;

const STATUS_LABEL = {
  active: "当前",
  completed: "已完成",
  not_completed: "未完成，已记录",
  replaced: "已替代",
} as const;

const FIELD_CONFIG: Array<{
  key: RealityClosureEditableField;
  label: string;
  rows?: number;
}> = [
  { key: "decision", label: "现在明确选择什么", rows: 2 },
  { key: "critical_unknown", label: "最关键未知", rows: 2 },
  { key: "next_action", label: "唯一现实动作", rows: 3 },
  { key: "completion_criterion", label: "怎样算确实做过", rows: 2 },
  { key: "expected_feedback", label: "完成后能知道什么", rows: 2 },
  {
    key: "rejected_alternative_reason",
    label: "为什么现在不走其他方向",
    rows: 2,
  },
];

export function RealityClosurePanel({
  caseId,
  latestVersion,
  closures,
}: {
  caseId: string;
  latestVersion: RealityVersion;
  closures: RealityClosure[];
}) {
  const router = useRouter();
  const active = closures.find((item) => item.status === "active") ?? null;
  const history = closures.filter((item) => item.status !== "active");
  const stale = active
    ? closureNeedsReconfirmation(active, latestVersion.id)
    : false;
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const due = active ? isClosureDue(active.due_on, today) : false;
  const [draft, setDraft] = useState<RealityClosureDraft | null>(null);
  const [fingerprint, setFingerprint] = useState("");
  const [sourceVersionNo, setSourceVersionNo] = useState<number | null>(null);
  const [reasoningCount, setReasoningCount] = useState(0);
  const [drafting, setDrafting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [replaceReason, setReplaceReason] = useState("");
  const [resultOpen, setResultOpen] = useState(false);
  const [resultNote, setResultNote] = useState("");
  const [reconfirmOpen, setReconfirmOpen] = useState(false);
  const [reconfirmNote, setReconfirmNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const edited = useRef(new Set<RealityClosureEditableField>());

  const initialMode = latestVersion.selected_path
    ? pathTypeToClosureMode(latestVersion.selected_path.type)
    : null;

  async function generateDraft() {
    if (!latestVersion.selected_path) {
      setError("请先在最新现状地图中确认一条初步方向");
      return;
    }
    setDrafting(true);
    setError(null);
    try {
      const result = await prepareRealityClosure(caseId, latestVersion.id);
      setDraft((current) =>
        current
          ? mergeClosureDraftKeepingEdits(
              current,
              result.draft,
              edited.current
            )
          : result.draft
      );
      setFingerprint(result.source_fingerprint);
      setSourceVersionNo(result.source_version_no);
      setReasoningCount(result.reasoning_count);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "生成收束草稿失败，请重试"
      );
    } finally {
      setDrafting(false);
    }
  }

  function updateField(
    field: RealityClosureEditableField,
    value: string
  ) {
    edited.current.add(field);
    setDraft((current) =>
      current ? { ...current, [field]: value || null } : current
    );
  }

  async function confirmDraft() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      await saveRealityClosure({
        case_id: caseId,
        version_id: latestVersion.id,
        draft,
        source_fingerprint: fingerprint,
        replaces_closure_id: replacing ? active?.id ?? null : null,
        replace_reason: replacing ? replaceReason : null,
      });
      setDraft(null);
      edited.current.clear();
      setReplacing(false);
      setReplaceReason("");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "保存当前下一步失败"
      );
    } finally {
      setSaving(false);
    }
  }

  async function recordResult(outcome: "completed" | "not_completed") {
    if (!active) return;
    setBusy(true);
    setError(null);
    try {
      await resolveRealityClosure(active.id, outcome, resultNote, caseId);
      setResultOpen(false);
      setResultNote("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "记录结果失败");
    } finally {
      setBusy(false);
    }
  }

  async function reconfirm() {
    if (!active) return;
    setBusy(true);
    setError(null);
    try {
      await reconfirmRealityClosure(
        active.id,
        latestVersion.id,
        reconfirmNote,
        caseId
      );
      setReconfirmOpen(false);
      setReconfirmNote("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "重新确认失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      id="current-next-move"
      className="scroll-mt-6 rounded-xl border-2 border-foreground bg-card p-5 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <Target className="mt-0.5 size-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            One current next move
          </p>
          <h2 className="mt-1 text-lg font-medium">当前下一步</h2>
        </div>
      </div>

      {active ? (
        <div className="mt-5">
          {stale && (
            <div className="mb-4 flex gap-2 rounded-md border border-orange-300 bg-orange-50 p-3 text-xs leading-5 text-orange-950">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                这一步基于旧现状版本。现实已经更新，请确认继续执行或带原因替代。
              </span>
            </div>
          )}
          {due && (
            <div className="mb-4 flex gap-2 rounded-md border border-orange-300 bg-orange-50 p-3 text-xs leading-5 text-orange-950">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>这一步已经到期。先记录现实结果，再决定是否继续分析。</span>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-foreground px-2.5 py-1 text-[10px] text-background">
              {MODE_LABEL[active.mode]}
            </span>
            <span className="text-xs text-muted-foreground">
              截止/复查：{active.due_on}
            </span>
          </div>
          <p className="mt-4 text-lg font-medium leading-8">
            {active.next_action}
          </p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            完成标准：{active.completion_criterion}
          </p>
          <details className="mt-4 rounded-md border bg-muted/30 p-3 text-xs">
            <summary className="cursor-pointer font-medium">
              查看决定、未知与依据
            </summary>
            <dl className="mt-3 space-y-3 leading-5 text-muted-foreground">
              <div>
                <dt className="text-foreground">决定</dt>
                <dd>{active.decision}</dd>
              </div>
              <div>
                <dt className="text-foreground">最关键未知</dt>
                <dd>{active.critical_unknown}</dd>
              </div>
              <div>
                <dt className="text-foreground">预期反馈</dt>
                <dd>{active.expected_feedback}</dd>
              </div>
              {active.wait_signal && (
                <div>
                  <dt className="text-foreground">重新判断信号</dt>
                  <dd>{active.wait_signal}</dd>
                </div>
              )}
            </dl>
          </details>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button type="button" onClick={() => setResultOpen(true)}>
              记录实际结果
            </Button>
            {stale && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setReconfirmOpen(true)}
              >
                基于新版本继续
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setReplacing(true);
                setDraft(null);
                void generateDraft();
              }}
            >
              替代这一步
            </Button>
          </div>

          {resultOpen && (
            <div className="mt-4 rounded-md border p-4">
              <label className="text-xs text-muted-foreground">
                实际发生了什么
                <textarea
                  value={resultNote}
                  onChange={(event) => setResultNote(event.target.value)}
                  rows={3}
                  className="mt-2 w-full rounded-md border bg-background p-3 text-sm text-foreground"
                />
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={busy || !resultNote.trim()}
                  onClick={() => void recordResult("completed")}
                >
                  已经做过
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy || !resultNote.trim()}
                  onClick={() => void recordResult("not_completed")}
                >
                  没有完成，记录原因
                </Button>
              </div>
            </div>
          )}

          {reconfirmOpen && (
            <div className="mt-4 rounded-md border p-4">
              <label className="text-xs text-muted-foreground">
                新现状下，为什么仍继续这一步
                <textarea
                  value={reconfirmNote}
                  onChange={(event) => setReconfirmNote(event.target.value)}
                  rows={3}
                  className="mt-2 w-full rounded-md border bg-background p-3 text-sm text-foreground"
                />
              </label>
              <Button
                type="button"
                size="sm"
                className="mt-3"
                disabled={busy || !reconfirmNote.trim()}
                onClick={() => void reconfirm()}
              >
                确认继续
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-5">
          <p className="text-sm leading-6 text-muted-foreground">
            当前还没有唯一下一步。结束分析，把判断变成一次可以对账的现实接触。
          </p>
          {!latestVersion.selected_path ? (
            <p className="mt-4 rounded-md bg-muted p-3 text-xs">
              请先在最新现状地图中确认一条初步方向。
            </p>
          ) : (
            <Button
              type="button"
              className="mt-4"
              disabled={drafting}
              onClick={() => void generateDraft()}
            >
              {drafting ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              结束分析，收束下一步
            </Button>
          )}
        </div>
      )}

      {draft && (
        <div className="mt-6 border-t pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-medium">可编辑收束草稿</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                基于现状版本 {sourceVersionNo}，合并 {reasoningCount}{" "}
                条关联推理记录。AI不会自动保存。
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={drafting}
              onClick={() => void generateDraft()}
            >
              <RotateCcw className="size-3.5" />
              重新生成
            </Button>
          </div>

          <div className="mt-5 space-y-4">
            <fieldset>
              <legend className="text-xs text-muted-foreground">
                当前决定
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["act", "verify", "wait"] as const).map((mode) => (
                  <label
                    key={mode}
                    className={
                      "cursor-pointer rounded-md border px-3 py-2 text-xs " +
                      (draft.mode === mode
                        ? "border-foreground bg-foreground text-background"
                        : "")
                    }
                  >
                    <input
                      type="radio"
                      className="sr-only"
                      checked={draft.mode === mode}
                      onChange={() => updateField("mode", mode)}
                    />
                    {MODE_LABEL[mode]}
                  </label>
                ))}
              </div>
            </fieldset>

            {FIELD_CONFIG.map((field) => (
              <label key={field.key} className="block">
                <span className="text-xs text-muted-foreground">
                  {field.label}
                </span>
                <textarea
                  value={(draft[field.key] as string | null) ?? ""}
                  onChange={(event) =>
                    updateField(field.key, event.target.value)
                  }
                  rows={field.rows ?? 2}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm leading-6"
                />
              </label>
            ))}

            {initialMode && draft.mode !== initialMode && (
              <label className="block">
                <span className="text-xs text-muted-foreground">
                  为什么改变初步方向
                </span>
                <textarea
                  value={draft.direction_change_reason ?? ""}
                  onChange={(event) =>
                    updateField(
                      "direction_change_reason",
                      event.target.value
                    )
                  }
                  rows={2}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </label>
            )}

            {draft.mode === "wait" && (
              <label className="block">
                <span className="text-xs text-muted-foreground">
                  看到什么现实信号时重新判断
                </span>
                <textarea
                  value={draft.wait_signal ?? ""}
                  onChange={(event) =>
                    updateField("wait_signal", event.target.value)
                  }
                  rows={2}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </label>
            )}

            <label className="block max-w-xs">
              <span className="text-xs text-muted-foreground">
                截止或复查日期
              </span>
              <input
                type="date"
                value={draft.due_on}
                onChange={(event) =>
                  updateField("due_on", event.target.value)
                }
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </label>

            {replacing && (
              <label className="block">
                <span className="text-xs text-muted-foreground">
                  现实发生了什么变化，必须替代当前下一步
                </span>
                <textarea
                  value={replaceReason}
                  onChange={(event) => setReplaceReason(event.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </label>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={
                  saving || (replacing && !replaceReason.trim())
                }
                onClick={() => void confirmDraft()}
              >
                {saving ? "保存中…" : "确认唯一下一步"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setDraft(null);
                  setReplacing(false);
                  edited.current.clear();
                }}
              >
                取消
              </Button>
            </div>
          </div>
        </div>
      )}

      <AiErrorNotice error={error} className="mt-4" />

      {history.length > 0 && (
        <details className="mt-6 border-t pt-4">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            收束历史（{history.length}）
          </summary>
          <div className="mt-3 space-y-2">
            {history.map((item) => {
              const lastEvent = item.events[item.events.length - 1];
              return (
                <div key={item.id} className="rounded-md border p-3 text-xs">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-medium">{item.next_action}</span>
                    <span className="text-muted-foreground">
                      {STATUS_LABEL[item.status]}
                    </span>
                  </div>
                  {lastEvent && (
                    <p className="mt-2 leading-5 text-muted-foreground">
                      {lastEvent.note}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      )}
    </section>
  );
}
