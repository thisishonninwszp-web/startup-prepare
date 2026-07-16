"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, LoaderCircle, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiErrorNotice } from "@/components/ai-error-notice";
import {
  prepareRealityDecisionClosure,
  resolveDecisionClosure,
  saveRealityDecisionClosure,
} from "./actions";
import type { DecisionClosure, DecisionClosureDraft } from "./domain";

export function RealityDecisionClosurePanel({
  caseId,
  versionId,
  closures,
}: {
  caseId: string;
  versionId: string;
  closures: DecisionClosure[];
}) {
  const router = useRouter();
  const active = closures.find((item) => item.status === "active") ?? null;
  const history = closures.filter((item) => item.status !== "active");
  const [draft, setDraft] = useState<DecisionClosureDraft | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sourceVersionNo, setSourceVersionNo] = useState<number | null>(null);
  const [replaceReason, setReplaceReason] = useState("");
  const [resultNote, setResultNote] = useState("");
  const [resultOpen, setResultOpen] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generateDraft(replace = false) {
    setDrafting(true);
    setError(null);
    setReplacing(replace);
    try {
      const result = await prepareRealityDecisionClosure(caseId, versionId);
      setDraft(result.draft);
      setSourceVersionNo(result.source_version_no);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "生成统一收束失败");
    } finally {
      setDrafting(false);
    }
  }

  function update<K extends keyof DecisionClosureDraft>(
    key: K,
    value: DecisionClosureDraft[K]
  ) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  async function saveDraft() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      await saveRealityDecisionClosure({
        case_id: caseId,
        version_id: versionId,
        draft,
        replaces_closure_id: replacing ? active?.id ?? null : null,
        replace_reason: replacing ? replaceReason : null,
      });
      setDraft(null);
      setReplacing(false);
      setReplaceReason("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存统一收束失败");
    } finally {
      setSaving(false);
    }
  }

  async function resolve(outcome: "completed" | "not_completed") {
    if (!active) return;
    setSaving(true);
    setError(null);
    try {
      await resolveDecisionClosure(
        active.id,
        outcome,
        resultNote,
        `/reality/${caseId}`
      );
      setResultOpen(false);
      setResultNote("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "记录对账结果失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-foreground/30 bg-foreground p-5 text-background shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <Target className="mt-0.5 size-5 shrink-0" />
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80">
            Unified closure
          </p>
          <h2 className="mt-1 text-lg font-medium">统一收束 · 今日下一步</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground/80">
            把这次分析压缩成一个当前判断、最大未知和可对账的唯一下一步。
          </p>
        </div>
      </div>

      {active ? (
        <div className="mt-5 rounded-lg border border-foreground/30 bg-foreground p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="rounded-full bg-muted/50 px-2.5 py-1 text-[10px] text-foreground">
              当前
            </span>
            <span className="text-xs text-muted-foreground/80">对账日 {active.due_on}</span>
          </div>
          <p className="mt-4 text-base font-medium leading-7">
            {active.selected_next_step}
          </p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground/80">
            完成标准：{active.completion_criterion}
          </p>
          <details className="mt-4 text-xs">
            <summary className="cursor-pointer text-background/80">
              查看判断、未知和路径
            </summary>
            <div className="mt-3 space-y-3 leading-5 text-muted-foreground/80">
              <p>当前判断：{active.current_judgment}</p>
              <div>
                <p className="text-background/80">最大未知</p>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {active.critical_unknowns.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-background/80">可选路径</p>
                <ul className="mt-1 space-y-2">
                  {active.options.map((item) => (
                    <li key={item.label} className="rounded-md bg-foreground p-2">
                      <p className="font-medium text-background">{item.label}</p>
                      <p>适用：{item.when_to_choose}</p>
                      <p>代价：{item.tradeoff}</p>
                      <p>小尝试：{item.small_try}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </details>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => setResultOpen(true)}>
              对账结果
            </Button>
            <Button type="button" variant="outline" onClick={() => void generateDraft(true)}>
              替代这一步
            </Button>
          </div>
          {resultOpen && (
            <div className="mt-4 rounded-md border border-foreground/30 p-3">
              <textarea
                value={resultNote}
                onChange={(event) => setResultNote(event.target.value)}
                rows={3}
                placeholder="现实中发生了什么？"
                className="w-full rounded-md border border-foreground/30 bg-foreground p-3 text-sm outline-none"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={saving || !resultNote.trim()}
                  onClick={() => void resolve("completed")}
                >
                  已完成
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={saving || !resultNote.trim()}
                  onClick={() => void resolve("not_completed")}
                >
                  未完成，记录原因
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <Button
          type="button"
          className="mt-5"
          variant="secondary"
          disabled={drafting}
          onClick={() => void generateDraft(false)}
        >
          {drafting ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <CheckCircle2 className="size-4" />
          )}
          带入统一收束
        </Button>
      )}

      {draft && (
        <div className="mt-5 rounded-lg border border-foreground/30 bg-foreground p-4">
          <p className="text-sm font-medium">
            可编辑收束草稿{sourceVersionNo ? ` · 现状版本 ${sourceVersionNo}` : ""}
          </p>
          <div className="mt-4 space-y-4">
            <TextArea
              label="当前判断"
              value={draft.current_judgment}
              onChange={(value) => update("current_judgment", value)}
            />
            <TextArea
              label="唯一下一步"
              value={draft.selected_next_step}
              onChange={(value) => update("selected_next_step", value)}
            />
            <TextArea
              label="完成标准"
              value={draft.completion_criterion}
              onChange={(value) => update("completion_criterion", value)}
            />
            <TextArea
              label="完成后能知道什么"
              value={draft.expected_feedback}
              onChange={(value) => update("expected_feedback", value)}
            />
            <label className="block">
              <span className="text-xs text-muted-foreground/80">对账日期</span>
              <input
                type="date"
                value={draft.due_on}
                onChange={(event) => update("due_on", event.target.value)}
                className="mt-1 w-full rounded-md border border-foreground/30 bg-foreground px-3 py-2 text-sm outline-none"
              />
            </label>
            {replacing && (
              <TextArea
                label="为什么替代当前下一步"
                value={replaceReason}
                onChange={setReplaceReason}
              />
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={saving || (replacing && !replaceReason.trim())}
                onClick={() => void saveDraft()}
              >
                {saving ? "保存中…" : "确认唯一下一步"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setDraft(null);
                  setReplacing(false);
                  setReplaceReason("");
                }}
              >
                取消
              </Button>
            </div>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <details className="mt-5 text-xs text-muted-foreground/80">
          <summary className="cursor-pointer">统一收束历史（{history.length}）</summary>
          <ul className="mt-3 space-y-2">
            {history.map((item) => (
              <li key={item.id} className="rounded-md border border-foreground/30 p-2">
                {item.selected_next_step}
              </li>
            ))}
          </ul>
        </details>
      )}

      <AiErrorNotice error={error} className="mt-4" />
    </section>
  );
}

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground/80">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        className="mt-1 w-full rounded-md border border-foreground/30 bg-foreground px-3 py-2 text-sm leading-6 outline-none"
      />
    </label>
  );
}
