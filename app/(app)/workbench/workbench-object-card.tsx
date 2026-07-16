import Link from "next/link";
import { ArrowRight, Clock3 } from "lucide-react";
import type { WorkbenchObject } from "./domain";

const TYPE_LABELS: Record<WorkbenchObject["object_type"], string> = {
  reality_case: "现状",
  idea: "想法",
  customer_case: "顾客",
  dream_case: "梦想",
  dream_branch: "梦想分支",
  retro_period: "复盘",
  company_profile: "公司",
  reasoning_session: "推理",
  decision_closure: "收束",
};

export function WorkbenchObjectCard({
  object,
  today,
}: {
  object: WorkbenchObject;
  today: string;
}) {
  const due =
    object.current_closure?.due_on &&
    object.current_closure.due_on <= today;
  return (
    <Link
      href={`/workbench/${object.object_type}/${object.object_id}`}
      className={
        "block rounded-lg border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md " +
        (due ? "border-status-validating/30 bg-status-validating/10" : "")
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">
            {TYPE_LABELS[object.object_type]}
          </span>
          <h3 className="mt-3 truncate text-sm font-medium">{object.title}</h3>
        </div>
        <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
      </div>
      {object.current_closure ? (
        <div className="mt-3 rounded-lg border bg-background/70 p-3">
          <p className="text-xs text-muted-foreground">当前下一步</p>
          <p className="mt-1 line-clamp-2 text-sm">
            {object.current_closure.selected_next_step}
          </p>
          <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock3 className="size-3" />
            对账日 {object.current_closure.due_on}
          </p>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          还没有统一收束。进入后先换个框架看，或生成下一步。
        </p>
      )}
    </Link>
  );
}
