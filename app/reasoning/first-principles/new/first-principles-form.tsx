"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createFirstPrinciplesSession } from "@/app/reasoning/actions";

export function FirstPrinciplesForm({
  ideaId,
  preClaim,
}: {
  ideaId: string | null;
  preClaim: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [claim, setClaim] = useState(preClaim);
  const [context, setContext] = useState("");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        const result = await createFirstPrinciplesSession(formData);
        router.push(`/reasoning/first-principles/${result.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "操作失败，请重试");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {ideaId && <input type="hidden" name="idea_id" value={ideaId} />}

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="original_claim">
          你相信什么？（信念/假设）
        </label>
        <textarea
          id="original_claim"
          name="original_claim"
          value={claim}
          onChange={(e) => setClaim(e.target.value)}
          rows={4}
          maxLength={500}
          placeholder="例：企业客户愿意为 SaaS 付费；B2B 销售周期必然很长；用户不会为这个付钱"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          required
        />
        <p className="text-xs text-muted-foreground">
          不需要是对的——正是因为你相信它，才更需要检验它的基础。
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
          placeholder="例：这是我们产品的核心假设，已经基于它做了 6 个月产品决策"
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
          {pending ? "AI 拆解中（约 20 秒）…" : "开始拆解"}
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
