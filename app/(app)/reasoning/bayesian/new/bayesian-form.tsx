"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  createBayesianBelief,
  prepareReasoningFromReality,
} from "@/app/(app)/reasoning/actions";
import type { RealityReasoningSnapshot } from "../../reality-source";
import { RealitySourceCard } from "../../reality-source-card";

export function BayesianForm({
  ideaId,
  realitySource,
}: {
  ideaId: string | null;
  realitySource: RealityReasoningSnapshot | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const edited = useRef(false);

  const generateDraft = useCallback(async () => {
    if (!realitySource) return;
    setDrafting(true);
    setDraftError(null);
    try {
      const draft = await prepareReasoningFromReality(
        "bayesian",
        realitySource.version.id
      );
      if (draft.tool === "bayesian" && !edited.current) {
        setQuestion(draft.question);
      }
    } catch (caught) {
      setDraftError(
        caught instanceof Error ? caught.message : "草稿生成失败，请重试"
      );
    } finally {
      setDrafting(false);
    }
  }, [realitySource]);

  useEffect(() => {
    void generateDraft();
  }, [generateDraft]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        const result = await createBayesianBelief(formData);
        router.push(`/reasoning/bayesian/${result.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "操作失败，请重试");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {ideaId && <input type="hidden" name="idea_id" value={ideaId} />}
      {realitySource && (
        <>
          <input
            type="hidden"
            name="reality_version_id"
            value={realitySource.version.id}
          />
          <RealitySourceCard snapshot={realitySource} />
          <div className="flex items-center gap-3 text-xs">
            <span className="text-muted-foreground">
              {drafting
                ? "正在根据现状生成草稿…"
                : draftError ?? "已生成可编辑草稿，请确认后提交。"}
            </span>
            {draftError && (
              <button
                type="button"
                onClick={() => void generateDraft()}
                className="underline underline-offset-4"
              >
                重试
              </button>
            )}
          </div>
        </>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="question">
          你相信什么？
        </label>
        <textarea
          id="question"
          name="question"
          value={question}
          onChange={(event) => {
            edited.current = true;
            setQuestion(event.target.value);
          }}
          rows={3}
          maxLength={500}
          placeholder="例：30% 的独立开发者在做项目管理时有真实痛点"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          required
        />
        <p className="text-xs text-muted-foreground">
          写成一个可以被证据更新的判断，不要写成目标或愿望。
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="prior">
          你现在有多相信它？（可选，留空让 AI 建议）
        </label>
        <div className="flex items-center gap-3">
          <input
            id="prior"
            name="prior"
            type="number"
            min="0"
            max="1"
            step="0.05"
            placeholder="0.00 – 1.00"
            className="w-36 rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <span className="text-xs text-muted-foreground">
            0 = 完全不信，1 = 完全确信
          </span>
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "AI 正在分析基率…" : "建立信念追踪"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.back()}
          disabled={pending}
        >
          取消
        </Button>
      </div>
    </form>
  );
}
