"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { MarkKind } from "@/lib/domains/signals/memory-shared";
import { setMarkAction } from "../memory-actions";
import { recordReadingOpenAction, stopReadingAction } from "../reading-session-actions";

export type QuickItem = {
  signal_id: string;
  section: string;
  short: string | null;
  headline: string;
  source: string;
  url: string | null;
  /** AI 整理的背景（默认折着：先看来源，按需展开）。 */
  background: string;
  opened: boolean;
  mark: MarkKind | null;
};

/** 滑多远算数（像素）。 */
const SWIPE = 80;

/**
 * 速读：一条一屏。右滑（或 →）标「重要」，左滑（或 ←）「看过了」；「跟我有关」点按钮。
 * 标了的进记忆、进「你在跟的事」、一周后回想；看过了的记成点开过（迁移 100）。都是现成的记法，不调 AI。
 */
export function QuickReader({ items, date }: { items: QuickItem[]; date: string }) {
  const firstUnread = Math.max(0, items.findIndex((i) => !i.opened));
  const [index, setIndex] = useState(items.some((i) => !i.opened) ? firstUnread : 0);
  const [marked, setMarked] = useState<Record<string, MarkKind>>(() => Object.fromEntries(items.flatMap((i) => (i.mark ? [[i.signal_id, i.mark]] : []))));
  const [showAi, setShowAi] = useState(false);
  const [dx, setDx] = useState(0);
  const [done, setDone] = useState(false);
  const [stopped, setStopped] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const start = useRef<number | null>(null);
  const item = items[index];

  const next = () => {
    setShowAi(false);
    setDx(0);
    if (index + 1 >= items.length) setDone(true);
    else setIndex(index + 1);
  };

  const act = (kind: "seen" | MarkKind) => {
    if (!item || pending) return;
    const target = item;
    startTransition(async () => {
      setError(null);
      try {
        const opened = await recordReadingOpenAction(target.signal_id);
        if (kind !== "seen") {
          const r = await setMarkAction(target.signal_id, kind);
          if (!r.ok) throw new Error(r.message);
          setMarked((m) => ({ ...m, [target.signal_id]: kind }));
        }
        if (!opened.ok) setError(opened.message);
      } catch (e) {
        setError(e instanceof Error ? e.message : "没记上，过一会儿再试。");
      }
    });
    next();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (done) return;
      if (e.key === "ArrowRight") act("important");
      if (e.key === "ArrowLeft") act("seen");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (items.length === 0) return <p className="text-sm leading-7 text-muted-foreground">今天的报告还没出来，或者都被你静音了。</p>;

  if (done || !item) {
    const count = Object.keys(marked).length;
    return (
      <div className="rounded-lg border bg-card p-6 text-sm leading-7">
        <p className="text-base font-semibold">看完了 {items.length} 条</p>
        <p className="text-muted-foreground">标了 {count} 条：它们会进记忆和「你在跟的事」，一周后回想一次。</p>
        {stopped ? (
          <p className="mt-3 text-primary">{stopped}</p>
        ) : (
          <Button
            className="mt-3"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await stopReadingAction(date, items.map((i) => i.signal_id));
                setStopped(r.ok ? "记下了：今天读到这里。报告之后有新加的会提醒你。" : r.message);
              })
            }
          >
            今天读到这里
          </Button>
        )}
        <p className="mt-3">
          <Link href="/signals" className="text-primary underline-offset-4 hover:underline">
            回「今天」
          </Link>
        </p>
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="font-mono text-xs text-muted-foreground">
        {index + 1} / {items.length} · {item.section}
        {marked[item.signal_id] ? ` · 已标「${marked[item.signal_id] === "important" ? "重要" : marked[item.signal_id] === "mine" ? "跟我有关" : "存疑"}」` : ""}
      </p>
      <div
        className="touch-pan-y select-none rounded-lg border bg-card p-5 transition-transform duration-150"
        style={{ transform: `translateX(${dx}px) rotate(${dx / 40}deg)` }}
        onPointerDown={(e) => {
          start.current = e.clientX;
        }}
        onPointerMove={(e) => {
          if (start.current !== null) setDx(e.clientX - start.current);
        }}
        onPointerUp={() => {
          const d = dx;
          start.current = null;
          if (d > SWIPE) act("important");
          else if (d < -SWIPE) act("seen");
          else setDx(0);
        }}
        onPointerCancel={() => {
          start.current = null;
          setDx(0);
        }}
      >
        <p className="text-lg font-semibold leading-8">{item.short ?? item.headline}</p>
        {item.short && <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.headline}</p>}
        <p className="mt-2 font-mono text-xs text-muted-foreground">
          {item.source}
          {item.url && (
            <a href={item.url} target="_blank" rel="noreferrer" className="ml-2 underline-offset-4 hover:underline" onPointerDown={(e) => e.stopPropagation()}>
              原文 ↗
            </a>
          )}
        </p>
        <button type="button" className="mt-3 text-xs text-muted-foreground underline-offset-4 hover:underline" onPointerDown={(e) => e.stopPropagation()} onClick={() => setShowAi((v) => !v)}>
          {showAi ? "收起 AI 整理" : "展开 AI 整理（不等于来源已证实的事实）"}
        </button>
        {showAi && <p className="mt-2 text-sm leading-7">{item.background}</p>}
        <p className="mt-3 text-xs">
          <Link href={`/signals/${item.signal_id}`} className="text-primary underline-offset-4 hover:underline" onPointerDown={(e) => e.stopPropagation()}>
            详细 →
          </Link>
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Button variant="outline" disabled={pending} onClick={() => act("seen")}>
          ← 看过了
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => act("mine")}>
          跟我有关
        </Button>
        <Button disabled={pending} onClick={() => act("important")}>
          重要 →
        </Button>
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <button type="button" disabled={index === 0} className="underline-offset-4 hover:underline disabled:opacity-40" onClick={() => setIndex(Math.max(0, index - 1))}>
          ← 上一条
        </button>
        <span>手机上左右滑；电脑上按 ← →</span>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
