"use client";

import {
  Brain,
  CheckCircle2,
  DoorClosed,
  DoorOpen,
  Eye,
  Gavel,
  Sparkles,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { TimelineEvent, TimelineEventKind } from "./queries";

const KIND_ICON: Record<TimelineEventKind, LucideIcon> = {
  idea_created: Sparkles,
  origin_observation: Eye,
  validation: Users,
  prediction_made: Target,
  prediction_resolved: CheckCircle2,
  decision: Gavel,
  exit_criterion_added: DoorOpen,
  exit_criterion_reviewed: DoorClosed,
  reasoning_session: Brain,
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TimelineView({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="mt-10 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        还没有足够的记录形成时间线。
      </p>
    );
  }

  return (
    <div className="relative mt-10 pl-8">
      <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />
      <ul className="space-y-6">
        {events.map((event, index) => {
          const Icon = KIND_ICON[event.kind];
          return (
            <li
              key={`${event.kind}-${event.at}-${index}`}
              className="animate-fade-up relative"
              style={{ animationDelay: `${Math.min(index * 60, 900)}ms` }}
            >
              <span
                className={
                  "absolute -left-8 grid size-6 place-items-center rounded-full border-2 bg-background " +
                  (event.isRealContact
                    ? "border-status-mvp/50 text-status-mvp"
                    : "border-muted-foreground/30 text-muted-foreground")
                }
              >
                <Icon className="size-3.5" strokeWidth={2} />
              </span>
              <div
                className={
                  "rounded-lg border p-3 " +
                  (event.isRealContact ? "border-status-mvp/30 bg-status-mvp/10/50" : "bg-card")
                }
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="text-sm font-medium">{event.title}</p>
                  <p className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {fmtDate(event.at)}
                  </p>
                </div>
                {event.detail && (
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground line-clamp-2">
                    {event.detail}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
