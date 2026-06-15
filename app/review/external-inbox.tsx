"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  runCrawl,
  promoteExternalSignal,
  dismissExternalSignal,
  type ExternalSignalItem,
} from "../capture/actions";

const SOURCE_LABELS: Record<string, string> = {
  hackernews: "Hacker News",
  reddit: "Reddit",
  devto: "Dev.to",
  lobsters: "Lobste.rs",
  v2ex: "V2EX",
  qiita: "Qiita",
  web: "网页",
};

/** 地区是源的固定属性——按 source 映射出徽章，告诉你这条来自哪个市场。 */
const SOURCE_REGION: Record<string, string> = {
  hackernews: "🇺🇸 英语圈",
  reddit: "🇺🇸 英语圈",
  devto: "🇺🇸 英语圈",
  lobsters: "🇺🇸 英语圈",
  v2ex: "🇨🇳 中文圈",
  qiita: "🇯🇵 日本",
  web: "🌐 网页",
};

/**
 * 外部待审收件箱：爬虫/一键抓取的信号先落 staging，这里由人审阅。
 * 顶部输入关键词点「抓取」即时入库（走 server action，无需终端）。
 * 提升 → 经 digestExternal 合成为带"外部"标签的观察，进入痛点雷达；忽略 → 不再出现。
 */
export function ExternalInbox({ items }: { items: ExternalSignalItem[] }) {
  const [list, setList] = useState(items);
  const [query, setQuery] = useState("");
  const [crawling, setCrawling] = useState(false);
  const [busy, setBusy] = useState<Record<string, "promote" | "dismiss">>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);

  async function crawl() {
    const q = query.trim();
    if (!q || crawling) return;
    setCrawling(true);
    setError(null);
    setNotice(null);
    setAnalysis(null);
    try {
      const result = await runCrawl(q);
      setList(result.items);
      setAnalysis(result.analysis || null);
      setNotice(
        result.newCount > 0
          ? `抓到 ${result.newCount} 条新待审。`
          : "没抓到新内容（可能都抓过了，或换个更具体的关键词）。"
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "抓取失败");
    } finally {
      setCrawling(false);
    }
  }

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

  return (
    <section className="mb-8 rounded-lg border bg-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">外部待审</h2>
        {list.length > 0 && (
          <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs tabular-nums text-muted-foreground">
            {list.length}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        打一个关键词，自动翻成中/英/日去五个社区抓真实讨论（HN · Dev.to · Lobste.rs / V2EX / Qiita），每条标注来自哪个市场，AI 分析本批信号的痛点模式。提升 → 经对抗合成变为带来源的观察；忽略 → 不再出现。机器噪音不会自动进你的捕捉流。
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void crawl();
            }
          }}
          placeholder="一个痛点 / 方向 / 竞品关键词"
          className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button onClick={crawl} disabled={crawling || !query.trim()}>
          {crawling ? "抓取中…" : "抓取"}
        </Button>
      </div>

      {notice && <p className="mt-3 text-sm text-muted-foreground">{notice}</p>}
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {analysis && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/40 dark:bg-amber-950/30">
          <p className="mb-1 text-xs font-medium text-amber-700 dark:text-amber-400">
            AI 信号分析
          </p>
          <p className="whitespace-pre-wrap text-xs text-amber-900 dark:text-amber-200">
            {analysis}
          </p>
        </div>
      )}

      {list.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          暂无待审。抓一批，或挂上 crawler 的定时任务持续喂。
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {list.map((it) => (
            <li key={it.id} className="rounded-md border p-3 text-sm">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {SOURCE_REGION[it.source] && (
                  <span className="rounded bg-muted px-1.5 py-0.5">
                    {SOURCE_REGION[it.source]}
                  </span>
                )}
                <span className="rounded bg-muted px-1.5 py-0.5">
                  {SOURCE_LABELS[it.source] ?? it.source}
                </span>
                {it.query && <span className="truncate">「{it.query}」</span>}
              </div>
              {it.title && <p className="mt-1.5 font-medium">{it.title}</p>}
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
      )}
    </section>
  );
}
