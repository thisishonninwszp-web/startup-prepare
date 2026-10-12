"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { HistoricalAnalog } from "@/lib/ai";
import type { StoredHistory } from "@/lib/domains/signals/analysis";
import { ensureHistoryAction } from "./actions";

function searchLink(q: string): string {
  return `https://www.google.com/search?${new URLSearchParams({ q })}`;
}

/** 每一次参照的核实结果：查到出处 / AI 记错了已改正 / 没查到。早期缓存的数据没有核实，只给查证链接。 */
function AnalogCheckView({ check, searchQuery }: { check?: HistoricalAnalog["check"]; searchQuery: string }) {
  if (!check || check.status === "unverified") {
    return (
      <p className="text-xs text-muted-foreground">
        {check ? "没查到出处，这一条是 AI 凭记忆写的。" : "AI 也会记错。"}
        <a
          href={searchLink(searchQuery)}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-1 underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline"
        >
          自己去查 ↗
        </a>
      </p>
    );
  }
  return (
    <div className="text-xs">
      {check.status === "corrected" ? (
        <p className="text-primary">AI 记错了，已按原文改正：{check.correction}</p>
      ) : (
        <p className="text-muted-foreground">查到出处</p>
      )}
      <details className="mt-1">
        <summary className="cursor-pointer text-muted-foreground">看原文</summary>
        <ul className="mt-1 space-y-2 leading-6 text-muted-foreground">
          {check.basis.map((b, j) => (
            <li key={j}>
              「{b.excerpt}」
              <a
                href={b.url}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1 text-primary underline-offset-4 hover:underline"
              >
                {b.title || "来源"} ↗
              </a>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function HistoryView({ history }: { history: StoredHistory }) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium text-muted-foreground">这类事通常会怎样</h3>
        <p className="mt-1 text-base leading-8">{history.baseRate}</p>
      </div>

      <div>
        <h3 className="text-sm font-medium text-muted-foreground">历史上类似的几次</h3>
        <ol className="mt-2 space-y-4">
          {history.analogs.map((a, i) => (
            <li key={i} className="border-l-2 border-border pl-3">
              {a.era === "ancient" && (
                <p className="mb-1 text-xs text-muted-foreground">古代的启发 · 只是类比，不算基准</p>
              )}
              <p className="font-mono text-xs text-muted-foreground">{a.when}</p>
              <p className="text-base leading-8">{a.what}</p>
              <p className="text-base leading-8">
                <span className="text-muted-foreground">后来：</span>
                {a.after}
              </p>
              <AnalogCheckView check={a.check} searchQuery={`${a.when} ${a.what}`} />
            </li>
          ))}
        </ol>
      </div>

      <div>
        <h3 className="text-sm font-medium text-muted-foreground">这次有什么不同</h3>
        <p className="mt-1 border-l-2 border-primary pl-3 text-base leading-8">{history.different}</p>
      </div>

      {history.books.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">想把这类事看明白，可以读</h3>
          <ul className="mt-2 space-y-3">
            {history.books.map((b) => (
              <li key={b.originalTitle} className="text-sm leading-7">
                <a
                  href={b.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  《{b.title}》
                </a>
                <span className="text-muted-foreground">
                  {" "}
                  {b.author}
                  {b.title !== b.originalTitle ? ` · 原书名 ${b.originalTitle}` : ""}
                </span>
                <p>{b.why}</p>
                <p className="font-mono text-xs text-muted-foreground">已在 {b.verifiedBy} 查到这本书</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * 历史上类似的事。已经生成过就直接显示；没生成过就给一个按钮，点了才去生成（要花一次 AI）。
 * defaultOpen：详情页写完判断后直接展开；练习卡片里默认收着，由人决定要不要先看。
 */
export function HistoryPanel({
  signalId,
  initial,
  label = "先看看历史上类似的事",
}: {
  signalId: string;
  initial: StoredHistory | null;
  label?: string;
}) {
  const [history, setHistory] = useState<StoredHistory | null>(initial);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (history && open) return <HistoryView history={history} />;

  if (pending) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">在翻历史、上网逐条核实、查书目，第一次要 20 到 30 秒……</p>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    );
  }

  return (
    <div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          if (history) {
            setOpen(true);
            return;
          }
          startTransition(async () => {
            const result = await ensureHistoryAction(signalId);
            if (result.ok) {
              setHistory(result.history);
              setOpen(true);
              setError(null);
            } else setError(result.message);
          });
        }}
      >
        {label}
      </Button>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
