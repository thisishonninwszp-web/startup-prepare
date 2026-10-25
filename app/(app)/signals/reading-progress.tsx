"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { readingSummary, type ReadingSessionState } from "@/lib/domains/signals/reading-session-shared";
import { stopReadingAction } from "./reading-session-actions";

const ReadingContext = createContext({ opened: new Set<string>(), unsynced: new Set<string>(), stoppedIds: null as string[] | null });

export function OpenedBadge({ signalId }: { signalId: string }) {
  const { opened, unsynced, stoppedIds } = useContext(ReadingContext);
  return <span className="text-xs text-muted-foreground">{opened.has(signalId) ? unsynced.has(signalId) ? "本次已展开 · 未同步" : "已展开" : "未展开"}{stoppedIds && !stoppedIds.includes(signalId) ? " · 结束后新增" : ""}</span>;
}

export function ReadingProgress({ date, ids, initial, children }: { date: string; ids: string[]; initial: ReadingSessionState; children: ReactNode }) {
  const [opened, setOpened] = useState(() => new Set(initial.openedIds));
  const [stopped, setStopped] = useState({ ids: initial.stoppedIds, at: initial.stoppedAt });
  const [unsynced, setUnsynced] = useState(new Set<string>());
  const [syncFailed, setSyncFailed] = useState(new Set<string>());
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  useEffect(() => {
    setOpened((old) => new Set([...old, ...initial.openedIds]));
    setUnsynced((old) => new Set([...old].filter((id) => !initial.openedIds.includes(id))));
    setStopped((old) => initial.stoppedAt && (!old.at || initial.stoppedAt > old.at) ? { ids: initial.stoppedIds, at: initial.stoppedAt } : old);
  }, [initial]);
  useEffect(() => {
    const handle = (event: Event) => {
      const detail = (event as CustomEvent<{ signalId: string; saved: boolean }>).detail;
      if (!detail || typeof detail.signalId !== "string") return;
      const id = detail.signalId;
      setOpened((old) => new Set([...old, id]));
      setUnsynced((old) => { const next = new Set(old); if (detail.saved) next.delete(id); else next.add(id); return next; });
      if (detail.saved) setSyncFailed((old) => { const next = new Set(old); next.delete(id); return next; });
    };
    const failed = (event: Event) => { const id = (event as CustomEvent<string>).detail; if (typeof id === "string") setSyncFailed((old) => new Set([...old, id])); };
    window.addEventListener("signal-opened", handle);
    window.addEventListener("signal-open-failed", failed);
    return () => { window.removeEventListener("signal-opened", handle); window.removeEventListener("signal-open-failed", failed); };
  }, []);
  const summary = readingSummary(ids, [...opened], stopped.ids);
  async function finish() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
        const result = await stopReadingAction(date, ids);
        if (result.ok) setStopped({ ids: [...ids], at: new Date().toISOString() });
        else setError(result.message);
    } catch { setError("网络没连上，阅读结束还没保存，请重试。"); }
    finally { busy.current = false; setPending(false); }
  }
  return (
    <ReadingContext.Provider value={{ opened, unsynced, stoppedIds: stopped.ids }}>
      {summary.total > 0 && (
        <div className="mb-5 rounded-lg border bg-card px-4 py-3 text-sm leading-7" aria-live="polite">
          <p>{summary.stopped ? "你已选择这份报告读到这里。" : `这份精选 ${summary.total} 条，已展开 ${summary.opened} 条。`}</p>
          {summary.added > 0 && <p className="text-primary">结束后又增加了 {summary.added} 条精选，按需继续。</p>}
          <p className="text-xs text-muted-foreground">展开只代表打开过；不必逐条读完，也不必每条都写判断。</p>
          {!initial.opensAvailable && <p className="text-xs text-muted-foreground">打开记录暂未启用；这里只显示本次页面的展开情况。</p>}
          {syncFailed.size > 0 && <p className="text-xs text-destructive" role="status">有展开记录尚未同步，刷新后可能丢失。重新展开对应新闻可重试。</p>}
        </div>
      )}
      {children}
      {summary.total > 0 && (
        <section className="mt-10 rounded-lg border bg-muted/30 p-5" aria-label="阅读终点">
          <h2 className="text-base font-semibold">{summary.stopped ? "这份报告已读到这里" : "这份精选到这里，可选探索在导航中"}</h2>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">理解了就可以结束。想继续时，再去全部新闻或回看追踪的事件。</p>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <Button variant="outline" disabled={pending || !initial.available || (summary.stopped && !summary.added)} onClick={finish}>
              {pending ? "在保存……" : summary.stopped && !summary.added ? "已保存阅读结束" : summary.added ? "新增的也读到这里" : "今天读到这里"}
            </Button>
            <Link href="/signals/inbox" className="text-sm text-muted-foreground hover:text-primary">继续探索全部新闻 →</Link>
          </div>
          {!initial.available && <p className="mt-2 text-xs text-muted-foreground">阅读结束记录尚未启用，请联系维护者完成数据库更新。仍可正常阅读。</p>}
          {error && <p className="mt-2 text-sm text-destructive" role="alert">{error}</p>}
        </section>
      )}
    </ReadingContext.Provider>
  );
}
