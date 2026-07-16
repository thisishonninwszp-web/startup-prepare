"use client";

import { useState } from "react";
import Link from "next/link";
import { Pause, Play, RefreshCcw } from "lucide-react";
import {
  runCustomerTopicNow,
  setCustomerTopicEnabled,
} from "../actions";
import type { listCustomerTopics } from "../queries";

type Topic = Awaited<ReturnType<typeof listCustomerTopics>>[number];

export function CustomerTopics({ initial }: { initial: Topic[] }) {
  const [topics, setTopics] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(topic: Topic) {
    setBusy(topic.id);
    setError(null);
    try {
      await setCustomerTopicEnabled(topic.id, !topic.enabled);
      setTopics((items) =>
        items.map((item) =>
          item.id === topic.id ? { ...item, enabled: !item.enabled } : item
        )
      );
    } catch (caught) {
      console.error("切换研究主题失败", caught);
      setError(caught instanceof Error ? caught.message : "操作失败");
    } finally {
      setBusy(null);
    }
  }

  async function run(topic: Topic) {
    setBusy(topic.id);
    setError(null);
    try {
      const result = await runCustomerTopicNow(topic.id);
      setTopics((items) =>
        items.map((item) =>
          item.id === topic.id
            ? {
                ...item,
                last_run_at: new Date().toISOString(),
                last_error: result.errors.length
                  ? result.errors.map((row) => row.message).join("; ")
                  : null,
              }
            : item
        )
      );
    } catch (caught) {
      console.error("运行研究主题失败", caught);
      setError(caught instanceof Error ? caught.message : "运行失败");
    } finally {
      setBusy(null);
    }
  }

  if (topics.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
        还没有定期主题。请在具体顾客课题内创建。
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {topics.map((topic) => (
        <article key={topic.id} className="rounded-lg border bg-card p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <Link
                href={`/customer-view/${topic.case_id}`}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {topic.case_title}
              </Link>
              <h2 className="mt-1 text-sm font-medium">{topic.query}</h2>
              <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                <span className="rounded-full bg-muted px-2 py-0.5">
                  {topic.cadence === "daily" ? "每日" : "每周"}
                </span>
                <span>{topic.markets.join(" · ")}</span>
                <span>
                  下次：{new Date(topic.next_run_at).toLocaleDateString("zh-CN")}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => run(topic)}
                disabled={busy === topic.id}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs hover:bg-muted"
              >
                <RefreshCcw className="size-3.5" />
                立即运行
              </button>
              <button
                type="button"
                onClick={() => toggle(topic)}
                disabled={busy === topic.id}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs hover:bg-muted"
              >
                {topic.enabled ? (
                  <Pause className="size-3.5" />
                ) : (
                  <Play className="size-3.5" />
                )}
                {topic.enabled ? "暂停" : "启用"}
              </button>
            </div>
          </div>
          {topic.last_error && (
            <p className="mt-3 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
              上次错误：{topic.last_error}
            </p>
          )}
        </article>
      ))}
    </div>
  );
}
