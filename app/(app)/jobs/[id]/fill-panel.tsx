"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { FillState } from "@/lib/domains/jobs/fill";
import { requestFillAction } from "../actions";

const ACTIVE = ["requested", "filling", "waiting"];

function statusLine(state: FillState): string | null {
  switch (state.status) {
    case "requested":
      return "交给你电脑上的填表助手了。它开着的话，几秒内会打开浏览器。";
    case "filling":
      return "助手正在填……";
    case "waiting":
      return "填好了。去浏览器里看一遍：补上黄色的格子，自己勾同意框，最后自己点「応募する」。";
    case "done":
      return "看到提交成功的页面了，已经记成「投了」。";
    case "failed":
      return `没填成：${state.note ?? "原因没写"}`;
    default:
      return null;
  }
}

/** 官网填表：点一下交给他电脑上的填表助手；助手填好停在页面上，提交由他自己点。 */
export function FillPanel({
  postingId,
  hasUrl,
  atsLabel,
  state,
  missingMigration,
}: {
  postingId: string;
  hasUrl: boolean;
  atsLabel: string | null;
  state: FillState | null;
  missingMigration: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const active = !!state?.status && ACTIVE.includes(state.status);

  // 助手在干活的时候每 5 秒刷新一下状态
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), 5_000);
    return () => clearInterval(timer);
  }, [active, router]);

  const request = () =>
    startTransition(async () => {
      setError(null);
      const r = await requestFillAction(postingId);
      if (!r.ok) setError(r.message);
      else router.refresh();
    });

  if (!hasUrl) {
    return (
      <section className="space-y-2 text-sm leading-7">
        <h2 className="text-base font-semibold">去填表</h2>
        <p className="text-muted-foreground">这个岗位是贴文字加进来的，没有页面可以填。</p>
      </section>
    );
  }

  const line = state ? statusLine(state) : null;
  return (
    <section className="space-y-3 text-sm leading-7">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">去填表</h2>
        <Button size="sm" disabled={pending || active || !!missingMigration} onClick={request}>
          {state?.status === "failed" ? "再试一次" : "去填表"}
        </Button>
      </div>
      <p className="text-muted-foreground">
        {atsLabel
          ? `这一页是 ${atsLabel} 的招聘页，不用登录就能应募。`
          : "这一页不是常见的招聘系统，助手会试着找应募表单；要登录才能应募的话，它会停下来告诉你。"}
        能填的它都先填上，最后「応募する」由你自己点。
      </p>
      {missingMigration && <p className="text-muted-foreground">{missingMigration}</p>}
      {line && <p>{line}</p>}
      {state?.status === "waiting" && state.note && <p className="text-xs text-muted-foreground">{state.note}</p>}
      <p className="text-xs text-muted-foreground">
        填表助手要在你电脑上开着：在项目文件夹里跑 <span className="font-mono">npm run jobs:helper</span>。
      </p>
      {error && <p className="text-muted-foreground">{error}</p>}
    </section>
  );
}
