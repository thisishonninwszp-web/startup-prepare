"use client";

import { useState } from "react";
import {
  promoteExternalSignal,
  dismissExternalSignal,
  type ExternalSignalItem,
} from "../capture/actions";

const SOURCE_LABELS: Record<string, string> = {
  hackernews: "Hacker News",
  reddit: "Reddit",
  v2ex: "V2EX",
  web: "网页",
};

/**
 * 外部待审收件箱：独立爬虫抓的信号先落 staging，这里由人审阅。
 * 提升 → 经 digestExternal 合成为带"外部"标签的观察，进入痛点雷达；忽略 → 不再出现。
 */
export function ExternalInbox({ items }: { items: ExternalSignalItem[] }) {
  const [list, setList] = useState(items);
  const [busy, setBusy] = useState<Record<string, "promote" | "dismiss">>({});
  const [error, setError] = useState<string | null>(null);

  async function promote(id: string) {
    if (busy[id]) return;
    setBusy((p) => ({ ...p, [id]: "promote" }));
    setError(null);
    try {
      await promoteExternalSignal(id);
      setList((l) => l.filter((it) => it.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "提升失败");
      setBusy((p) => {
        const n = { ...p };
        delete n[id];
        return n;
      });
    }
  }

  async function dismiss(id: string) {
    if (busy[id]) return;
    setBusy((p) => ({ ...p, [id]: "dismiss" }));
    setError(null);
    try {
      await dismissExternalSignal(id);
      setList((l) => l.filter((it) => it.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "忽略失败");
      setBusy((p) => {
        const n = { ...p };
        delete n[id];
        return n;
      });
    }
  }

  if (list.length === 0) return null;

  return (
    <section className="mb-8 rounded-lg border bg-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">外部待审</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs tabular-nums text-muted-foreground">
          {list.length}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        爬虫抓来的外部讨论先到这里。挑相关的提升成观察（会经过对抗合成、附来源），其余忽略——机器噪音不会自动进你的捕捉流。
      </p>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      <ul className="mt-4 space-y-2">
        {list.map((it) => (
          <li key={it.id} className="rounded-md border p-3 text-sm">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded bg-muted px-1.5 py-0.5">
                {SOURCE_LABELS[it.source] ?? it.source}
              </span>
              {it.query && <span className="truncate">「{it.query}」</span>}
            </div>
            {it.title && (
              <p className="mt-1.5 font-medium">{it.title}</p>
            )}
            <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-muted-foreground">
              {it.raw_text}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => promote(it.id)}
                disabled={!!busy[it.id]}
                className="rounded-md border border-primary bg-primary px-2.5 py-1 text-xs text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-50"
              >
                {busy[it.id] === "promote" ? "提升中…" : "提升为观察"}
              </button>
              <button
                type="button"
                onClick={() => dismiss(it.id)}
                disabled={!!busy[it.id]}
                className="rounded-md border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                忽略
              </button>
              {it.url && (
                <a
                  href={it.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto max-w-[40%] truncate text-xs text-primary underline-offset-4 hover:underline"
                >
                  来源 ↗
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
