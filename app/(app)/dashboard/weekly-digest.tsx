"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/** ISO 周编号，作为"本周已读"的 localStorage key。 */
function isoWeekKey(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `ideaos-weekly-digest-${d.getUTCFullYear()}-W${week}`;
}

export type WeeklyDigestData = {
  realContacts: number;
  toolOps: number;
  duePredictions: number;
  staleValidatingIdeas: number;
  pendingReview: number;
};

/**
 * 每周对抗性摘要：系统第一次主动开口。
 * 每周首次打开 dashboard 时全屏拦截一次，只陈述事实，不安慰。
 */
export function WeeklyDigest({ data }: { data: WeeklyDigestData }) {
  const [open, setOpen] = useState(false);

  const hasSomethingToSay =
    data.realContacts === 0 ||
    data.duePredictions > 0 ||
    data.staleValidatingIdeas > 0 ||
    data.pendingReview > 0;

  useEffect(() => {
    if (!hasSomethingToSay) return;
    try {
      const key = isoWeekKey();
      if (!localStorage.getItem(key)) setOpen(true);
    } catch {
      // localStorage 不可用时静默跳过，不拦截。
    }
  }, [hasSomethingToSay]);

  function dismiss() {
    try {
      localStorage.setItem(isoWeekKey(), new Date().toISOString());
    } catch {
      // 写入失败只影响下次是否再次拦截，不影响关闭。
    }
    setOpen(false);
  }

  if (!open) return null;

  const lines: { text: string; href: string; severe: boolean }[] = [];
  if (data.realContacts === 0) {
    lines.push({
      text: `过去 7 天真实接触 0 次，工具内操作 ${data.toolOps} 次`,
      href: "/learnings?tab=patterns",
      severe: true,
    });
  }
  if (data.duePredictions > 0) {
    lines.push({
      text: `${data.duePredictions} 条预测已到期，还没有和现实对账`,
      href: "/retrospectives",
      severe: false,
    });
  }
  if (data.staleValidatingIdeas > 0) {
    lines.push({
      text: `${data.staleValidatingIdeas} 个验证中的想法超过 3 天没有任何新的真实接触`,
      href: "/ideas",
      severe: false,
    });
  }
  if (data.pendingReview > 0) {
    lines.push({
      text: `${data.pendingReview} 件材料等着你朱批`,
      href: "/materials/review",
      severe: false,
    });
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-sm">
      <div className="animate-fade-up mx-4 w-full max-w-lg">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
          本周系统开口 · 只说一次
        </p>
        <h2 className="mt-3 font-serif text-2xl tracking-tight">
          在你开始使用任何工具之前——
        </h2>
        <ul className="mt-6 space-y-3">
          {lines.map((line) => (
            <li key={line.text}>
              <Link
                href={line.href}
                onClick={dismiss}
                className={
                  "block rounded-lg border p-4 text-sm transition-colors hover:bg-muted " +
                  (line.severe
                    ? "border-destructive/50 font-medium text-destructive"
                    : "")
                }
              >
                {line.text} →
              </Link>
            </li>
          ))}
        </ul>
        <Button
          type="button"
          onClick={dismiss}
          className="mt-8 w-full rounded-lg border px-4 py-3 text-sm text-muted-foreground hover:bg-muted"
        >
          我看到了（本周不再提醒）
        </Button>
      </div>
    </div>
  );
}
