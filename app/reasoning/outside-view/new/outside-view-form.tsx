"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createOutsideViewSession } from "@/app/reasoning/actions";

export function OutsideViewForm({
  ideaId,
  prePlan,
}: {
  ideaId: string | null;
  prePlan: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState(prePlan);
  const [context, setContext] = useState("");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        const result = await createOutsideViewSession(formData);
        router.push(`/reasoning/outside-view/${result.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "操作失败，请重试");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {ideaId && <input type="hidden" name="idea_id" value={ideaId} />}

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="plan_text">
          你的计划/想法是什么？
        </label>
        <textarea
          id="plan_text"
          name="plan_text"
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
          rows={4}
          maxLength={500}
          placeholder="例：做一个面向独立开发者的付费 SaaS 工具，靠内容营销获客"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          required
        />
        <p className="text-xs text-muted-foreground">
          写具体一点——AI 需要先给你找一类相似的案例，越模糊越难找到贴切的参照。
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="context_note">
          背景补充（可选）
        </label>
        <textarea
          id="context_note"
          name="context_note"
          value={context}
          onChange={(e) => setContext(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="例：已经做了 2 个月，还没有付费用户"
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
          {pending ? "AI 分析中（约 20 秒）…" : "找参照类别"}
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
