"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { BriefItem } from "@/lib/domains/signals/brief";
import type { SignalKind } from "@/lib/domains/signals/feeds";
import { generateBriefNow, saveSignalContext } from "./actions";

const PLACEHOLDER =
  "比如：在日本一家电商公司做广告数据分析，经营层第一年。在考虑转职，最终想创业，但还没找到方向。最近在学统计和用 AI 写代码。";

/** AI 挑新闻、读新闻时知道的"你"。默认收起，没写过时展开。 */
export function ContextEditor({ initial }: { initial: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(!initial);
  const [text, setText] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <div className="mb-4 flex items-start justify-between gap-4 rounded-lg border bg-card p-4">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">AI 知道的你</p>
          <p className="line-clamp-2 text-sm leading-7">{initial}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          改
        </Button>
      </div>
    );
  }

  return (
    <form
      className="mb-4 rounded-lg border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          try {
            await saveSignalContext(text);
            setError(null);
            setOpen(false);
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "没存上");
          }
        });
      }}
    >
      <p className="text-sm font-medium">先告诉 AI 你是谁</p>
      <p className="mb-3 mt-1 text-xs leading-6 text-muted-foreground">
        它挑新闻、讲新闻时会照着这几句来。不写也能用，只是讲得会比较泛。写过之后，每天早上才会自动出精选。
      </p>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={PLACEHOLDER}
        rows={3}
        maxLength={1000}
      />
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      <div className="mt-3 flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "存着…" : "存下"}
        </Button>
        {initial && (
          <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setOpen(false)}>
            取消
          </Button>
        )}
      </div>
    </form>
  );
}

export function BriefPanel({ kind, items }: { kind: SignalKind; items: BriefItem[] | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  const generate = () =>
    startTransition(async () => {
      const result = await generateBriefNow(kind);
      if (!result.ok) setNote(result.message);
      else if (result.count === 0) setNote("最近一天半没有新进来的条目，先点右上角抓一次。");
      else {
        setNote(null);
        router.refresh();
      }
    });

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="text-base font-semibold">今天的 5 条</h2>
        <Button variant="ghost" size="sm" disabled={pending} onClick={generate}>
          {pending ? "在挑…" : items ? "重新挑" : "现在挑"}
        </Button>
      </div>

      {items && items.length > 0 ? (
        <ol className="space-y-4">
          {items.map((item, i) => (
            <li key={item.signal_id} className="text-sm leading-7">
              <p className="font-mono text-xs text-muted-foreground">
                {String(i + 1).padStart(2, "0")} · {item.source}
              </p>
              {item.url ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium transition-colors duration-150 hover:text-primary"
                >
                  {item.headline}
                </a>
              ) : (
                <p className="font-medium">{item.headline}</p>
              )}
              <p className="text-muted-foreground">{item.background}</p>
              <p>
                <span className="text-xs text-muted-foreground">
                  {kind === "tools" ? "你可以试：" : "跟你："}
                </span>
                {item.for_you}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm leading-7 text-muted-foreground">
          今天的还没挑。每天早上 7 点会自动挑一次（前提是上面写过「关于你」）；现在想看就点「现在挑」，大约要十几秒。
        </p>
      )}
      {note && <p className="mt-3 text-xs text-destructive">{note}</p>}
    </section>
  );
}
