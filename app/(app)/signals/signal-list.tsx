"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import type { NewsAnalysis } from "@/lib/ai";
import { newsSourceLabel, type SignalKind } from "@/lib/domains/signals/feeds";
import { usableSummary } from "@/lib/domains/signals/summary";
import { analyzeSignal, dismissSignal, keepSignal, refreshSignals } from "./actions";
import type { NewsItem } from "./queries";

const TIME = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function when(item: NewsItem): string {
  return item.published_at ? TIME.format(new Date(item.published_at)) : "--";
}

export function RefreshButton({ kind }: { kind: SignalKind }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-3">
      {note && <span className="text-xs text-muted-foreground">{note}</span>}
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            try {
              const { inserted, failed } = await refreshSignals(kind);
              setNote(
                (inserted > 0 ? `新进来 ${inserted} 条` : "没有新的") +
                  (failed.length > 0 ? `，${failed.length} 个源没抓到` : "")
              );
              router.refresh();
            } catch (error) {
              setNote(error instanceof Error ? error.message : "抓取失败");
            }
          })
        }
      >
        {pending ? "抓取中…" : "现在抓一次"}
      </Button>
    </div>
  );
}

type RowState =
  | { kind: "idle" }
  | { kind: "noting" }
  | { kind: "kept" }
  | { kind: "dismissed" };

type AnalysisState =
  | { kind: "none" }
  | { kind: "done"; analysis: NewsAnalysis }
  | { kind: "failed"; message: string };

function SignalRow({ item, kind }: { item: NewsItem; kind: SignalKind }) {
  const [pending, startTransition] = useTransition();
  const [analyzing, startAnalysis] = useTransition();
  const [state, setState] = useState<RowState>({ kind: "idle" });
  const [analysis, setAnalysis] = useState<AnalysisState>({ kind: "none" });
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (state.kind === "dismissed") return null;
  const summary = usableSummary(item.title, item.raw_text);

  const keep = () =>
    startTransition(async () => {
      try {
        await keepSignal(item.id, note);
        setState({ kind: "kept" });
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "没记下来");
      }
    });

  return (
    <li className="border-b py-3 last:border-b-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p className="font-mono text-xs text-muted-foreground">
            {when(item)} · {newsSourceLabel(item.source)}
          </p>
          {item.url ? (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm leading-7 transition-colors duration-150 hover:text-primary"
            >
              {item.title}
            </a>
          ) : (
            <p className="text-sm leading-7">{item.title}</p>
          )}
          {summary && (
            <p className="line-clamp-2 text-xs leading-6 text-muted-foreground">{summary}</p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {state.kind === "kept" ? (
            <Link href="/capture" className="text-xs text-primary underline-offset-4 hover:underline">
              已记进观察 →
            </Link>
          ) : (
            <>
              {kind === "news" && (
              <Button
                variant="ghost"
                size="sm"
                disabled={analyzing || analysis.kind === "done"}
                onClick={() =>
                  startAnalysis(async () => {
                    const result = await analyzeSignal(item.id);
                    setAnalysis(
                      result.ok
                        ? { kind: "done", analysis: result.analysis }
                        : { kind: "failed", message: result.message }
                    );
                  })
                }
              >
                {analyzing ? "在读…" : "这条意味着什么"}
              </Button>
              )}
              {state.kind !== "noting" && (
                <>
                  <Button variant="outline" size="sm" disabled={pending} onClick={() => setState({ kind: "noting" })}>
                    记一笔
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        try {
                          await dismissSignal(item.id);
                          setState({ kind: "dismissed" });
                        } catch (e) {
                          setError(e instanceof Error ? e.message : "没忽略掉");
                        }
                      })
                    }
                  >
                    不看了
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {state.kind === "noting" && (
        <form
          className="mt-2 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            keep();
          }}
        >
          <Input
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="为什么在意？一句话就够，也可以不写"
            maxLength={200}
          />
          <div className="flex shrink-0 gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "记下中…" : "记下"}
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setState({ kind: "idle" })}>
              取消
            </Button>
          </div>
        </form>
      )}

      {analysis.kind === "done" && (
        <dl className="mt-3 space-y-2 rounded-md bg-muted/50 p-3 text-sm leading-7">
          <div>
            <dt className="text-xs text-muted-foreground">来龙去脉</dt>
            <dd>{analysis.analysis.background}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">会落到谁身上</dt>
            <dd>{analysis.analysis.chain}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">跟你</dt>
            <dd>{analysis.analysis.forYou}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">能找谁聊</dt>
            <dd>
              {analysis.analysis.who}：「{analysis.analysis.question}」
            </dd>
          </div>
        </dl>
      )}
      {analysis.kind === "failed" && (
        <p className="mt-2 text-xs text-destructive">{analysis.message}</p>
      )}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </li>
  );
}

export function SignalList({ items, kind }: { items: NewsItem[]; kind: SignalKind }) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="这里空着。"
        description="今天的新闻还没抓，或者你已经全看完了。点右上角「现在抓一次」，或者等明早 7 点。"
      />
    );
  }
  return (
    <ul className="rounded-lg border bg-card px-4">
      {items.map((item) => (
        <SignalRow key={item.id} item={item} kind={kind} />
      ))}
    </ul>
  );
}
