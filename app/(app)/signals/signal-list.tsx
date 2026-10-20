"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { isGithubSource, newsSourceLabel, splitRepoText, type SignalKind } from "@/lib/domains/signals/feeds";
import { formatTokyoTime } from "@/lib/domains/signals/format";
import { usableSummary } from "@/lib/domains/signals/summary";
import { refreshSignals } from "./actions";
import { SignalActions } from "./signal-actions";
import type { NewsItem } from "./queries";

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

function SignalRow({ item }: { item: NewsItem }) {
  const [gone, setGone] = useState(false);
  if (gone) return null;
  // GitHub 仓库：中文"能干什么"那一句当正文，英文原简介放小字；别的都按新闻处理
  const repo = isGithubSource(item.source) ? splitRepoText(item.raw_text) : null;
  const summary = repo ? repo.zh ?? repo.rest : usableSummary(item.title, item.raw_text);

  return (
    <li className="border-b py-5 last:border-b-0">
      <p className="font-mono text-xs text-muted-foreground">
        {formatTokyoTime(item.published_at)} · {newsSourceLabel(item.source)}
      </p>
      <h3 className="mt-1 text-base font-medium leading-7">
        <Link href={`/signals/${item.id}`} className="transition-colors duration-150 hover:text-primary">
          {item.title}
        </Link>
      </h3>
      {summary && <p className="mt-1 text-sm leading-7">{summary}</p>}
      {repo?.zh && repo.rest && <p className="mt-1 text-xs leading-6 text-muted-foreground">{repo.rest}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <Link href={`/signals/${item.id}`} className="text-primary underline-offset-4 hover:underline">
          看具体报告 →
        </Link>
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline"
          >
            原文 ↗
          </a>
        )}
        <SignalActions id={item.id} onDismissed={() => setGone(true)} />
      </div>
    </li>
  );
}

export function SignalList({ items }: { items: NewsItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="这里空着。"
        description="还没抓，或者你已经全看完了。点右上角「现在抓一次」，或者等明早 7 点前。"
      />
    );
  }
  return (
    <ul className="rounded-lg border bg-card px-5">
      {items.map((item) => (
        <SignalRow key={item.id} item={item} />
      ))}
    </ul>
  );
}
