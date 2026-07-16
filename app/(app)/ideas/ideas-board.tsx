"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  IDEA_STATUSES,
  daysUntilLock,
  type Idea,
  type IdeaStatus,
} from "./types";
import { updateIdeaStatus } from "./actions";
import { Button } from "@/components/ui/button";

/** 各状态列的配色（宪法：验证中=橙、MVP候选=绿、归档=红、其余中性）。 */
const STATUS_STYLE: Record<
  IdeaStatus,
  { dot: string; header: string; ring: string }
> = {
  观察: { dot: "bg-muted-foreground/40", header: "text-foreground", ring: "ring-foreground/30" },
  假设: { dot: "bg-muted-foreground/40", header: "text-foreground", ring: "ring-foreground/30" },
  验证中: { dot: "bg-status-validating", header: "text-status-validating", ring: "ring-status-validating/40" },
  MVP候选: { dot: "bg-status-mvp", header: "text-status-mvp", ring: "ring-status-mvp/40" },
  归档: { dot: "bg-destructive", header: "text-destructive", ring: "ring-destructive/40" },
};

export function IdeasBoard({ initial }: { initial: Idea[] }) {
  const [ideas, setIdeas] = useState<Idea[]>(initial);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<IdeaStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    ideas.forEach((i) => i.tags.forEach((t) => set.add(t)));
    return Array.from(set);
  }, [ideas]);

  const filtered = useMemo(
    () =>
      selectedTags.length === 0
        ? ideas
        : ideas.filter((i) => i.tags.some((t) => selectedTags.includes(t))),
    [ideas, selectedTags]
  );

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  async function moveTo(ideaId: string, status: IdeaStatus) {
    const idea = ideas.find((i) => i.id === ideaId);
    if (!idea || idea.status === status) return;

    const prev = ideas;
    // 乐观更新（拖入"验证中"同步刷新 last_activity_at）。
    setIdeas((cur) =>
      cur.map((i) =>
        i.id === ideaId
          ? {
              ...i,
              status,
              last_activity_at:
                status === "验证中"
                  ? new Date().toISOString()
                  : i.last_activity_at,
            }
          : i
      )
    );
    setError(null);

    try {
      await updateIdeaStatus(ideaId, status);
    } catch (e) {
      setIdeas(prev); // 回滚
      setError(e instanceof Error ? e.message : "更新失败");
    }
  }

  return (
    <div className="space-y-4">
      {/* 标签筛选 */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">筛选：</span>
          {allTags.map((tag) => {
            const active = selectedTags.includes(tag);
            return (
              <Button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={
                  "rounded-full border px-2.5 py-0.5 text-xs transition-colors " +
                  (active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background text-muted-foreground hover:bg-muted")
                }
              >
                #{tag}
              </Button>
            );
          })}
          {selectedTags.length > 0 && (
            <Button
              type="button"
              onClick={() => setSelectedTags([])}
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              清除
            </Button>
          )}
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {/* 5 列看板 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {IDEA_STATUSES.map((status) => {
          const style = STATUS_STYLE[status];
          const cards = filtered.filter((i) => i.status === status);
          const isOver = dragOver === status;
          return (
            <div
              key={status}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragOver !== status) setDragOver(status);
              }}
              onDragLeave={(e) => {
                // 仅当真正离开列容器时清除高亮
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDragOver((cur) => (cur === status ? null : cur));
                }
              }}
              onDrop={() => {
                if (draggingId) void moveTo(draggingId, status);
                setDragOver(null);
                setDraggingId(null);
              }}
              className={
                "flex min-h-[30vh] flex-col rounded-lg border bg-muted/20 p-3 transition-colors lg:min-h-[60vh] " +
                (isOver ? `ring-2 ${style.ring}` : "")
              }
            >
              <div className="mb-3 flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${style.dot}`} />
                <span className={`text-sm font-medium ${style.header}`}>
                  {status}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {cards.length}
                </span>
              </div>

              <div className="flex flex-1 flex-col gap-2">
                {cards.map((idea) => (
                  <article
                    key={idea.id}
                    draggable
                    onDragStart={() => setDraggingId(idea.id)}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setDragOver(null);
                    }}
                    className={
                      "group cursor-grab rounded-md border bg-card p-3 shadow-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md active:cursor-grabbing " +
                      (draggingId === idea.id ? "opacity-50" : "")
                    }
                  >
                    <p className="line-clamp-3 text-sm">
                      {idea.title?.trim() || "（无标题）"}
                    </p>
                    {idea.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {idea.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                    {status === "验证中" && (
                      <LockBadge lastActivityAt={idea.last_activity_at} />
                    )}
                    <Link
                      href={`/ideas/${idea.id}`}
                      draggable={false}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-2 inline-block text-xs text-primary underline-offset-4 hover:underline"
                    >
                      打开 →
                    </Link>
                  </article>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** "验证中"卡片的锁定倒计时小徽标（强制出口机制可视化）。 */
function LockBadge({ lastActivityAt }: { lastActivityAt: string }) {
  const left = daysUntilLock(lastActivityAt);
  let cls: string;
  let text: string;
  if (left <= 0) {
    text = "已锁定";
    cls = "border-destructive/30 bg-destructive/10 text-destructive";
  } else if (left <= 1) {
    text = `还剩 ${left} 天`;
    cls = "border-status-validating/30 bg-status-validating/10 text-status-validating";
  } else {
    text = `还剩 ${left} 天`;
    cls = "border-border bg-muted text-muted-foreground";
  }
  return (
    <div
      className={
        "mt-2 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] " +
        cls
      }
    >
      {text}
    </div>
  );
}
