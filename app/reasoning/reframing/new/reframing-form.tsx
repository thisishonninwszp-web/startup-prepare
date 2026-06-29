"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  createReframingSession,
  prepareReasoningFromReality,
} from "@/app/reasoning/actions";
import type { RealityReasoningSnapshot } from "../../reality-source";
import { RealitySourceCard } from "../../reality-source-card";

export function ReframingForm({
  ideaId,
  realitySource,
}: {
  ideaId: string | null;
  realitySource: RealityReasoningSnapshot | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [context, setContext] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const edited = useRef(false);

  const generateDraft = useCallback(async () => {
    if (!realitySource) return;
    setDrafting(true);
    setDraftError(null);
    try {
      const draft = await prepareReasoningFromReality(
        "reframing",
        realitySource.version.id
      );
      if (draft.tool === "reframing" && !edited.current) {
        setTopic(draft.topic_text);
        setContext(draft.context_note);
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
        const result = await createReframingSession(formData);
        router.push(`/reasoning/reframing/${result.id}`);
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
        <label className="text-sm font-medium" htmlFor="topic_text">
          你面对的课题是什么？
        </label>
        <textarea
          id="topic_text"
          name="topic_text"
          value={topic}
          onChange={(event) => {
            edited.current = true;
            setTopic(event.target.value);
          }}
          rows={4}
          maxLength={1000}
          placeholder="例：我不知道是否应该放弃现在的产品方向，还是再坚持一段时间"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          required
        />
        <p className="text-xs text-muted-foreground">
          不需要有标准答案，越具体越好。
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="context_note">
          补充背景（可选）
        </label>
        <textarea
          id="context_note"
          name="context_note"
          value={context}
          onChange={(event) => {
            edited.current = true;
            setContext(event.target.value);
          }}
          rows={2}
          maxLength={500}
          placeholder="例：我已经做了 6 个月，有 20 个用户，但增长停滞"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "AI 生成 26 种视角中…" : "生成重构视角"}
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
