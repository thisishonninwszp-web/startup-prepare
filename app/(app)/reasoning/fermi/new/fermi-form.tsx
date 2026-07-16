"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  createFermiEstimate,
  prepareReasoningFromReality,
} from "@/app/(app)/reasoning/actions";
import type { RealityReasoningSnapshot } from "../../reality-source";
import { RealitySourceCard } from "../../reality-source-card";

const CATEGORIES = [
  { value: "market", label: "市场规模" },
  { value: "time", label: "时间估算" },
  { value: "cost", label: "成本估算" },
  { value: "custom", label: "自定义" },
];

export function FermiForm({
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
  const [category, setCategory] = useState("market");
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const edited = useRef(false);

  const generateDraft = useCallback(async () => {
    if (!realitySource) return;
    setDrafting(true);
    setDraftError(null);
    try {
      const draft = await prepareReasoningFromReality(
        "fermi",
        realitySource.version.id
      );
      if (draft.tool === "fermi" && !edited.current) {
        setQuestion(draft.question);
        setCategory(draft.category);
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
        const result = await createFermiEstimate(formData);
        router.push(`/reasoning/fermi/${result.id}`);
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
              <Button
                type="button"
                onClick={() => void generateDraft()}
                className="underline underline-offset-4"
              >
                重试
              </Button>
            )}
          </div>
        </>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="question">
          你想估算什么？
        </label>
        <textarea
          id="question"
          name="question"
          value={question}
          onChange={(event) => {
            edited.current = true;
            setQuestion(event.target.value);
          }}
          rows={2}
          maxLength={500}
          placeholder="例：这个细分市场每年的市场规模是多少美元？"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          required
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">类别</label>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <label
              key={cat.value}
              className="flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs has-[:checked]:border-foreground has-[:checked]:bg-foreground has-[:checked]:text-background"
            >
              <input
                type="radio"
                name="category"
                value={cat.value}
                checked={category === cat.value}
                onChange={() => {
                  edited.current = true;
                  setCategory(cat.value);
                }}
                className="sr-only"
              />
              {cat.label}
            </label>
          ))}
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "AI 正在拆解问题…" : "开始估算"}
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
