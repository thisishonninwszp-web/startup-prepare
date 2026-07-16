import { cn } from "@/lib/utils"

/**
 * 全站唯一的状态色实现（宪法 UI 铁律 2）。
 * 想法 5 状态 + Go/Kill 判定，颜色来自 globals.css 的语义状态 token。
 * 禁止页面自建 Record<状态, 颜色类> 映射表。
 */

export type IdeaStatus = "观察" | "假设" | "验证中" | "MVP候选" | "归档"
export type Verdict = "go" | "kill"

const STATUS_STYLES: Record<IdeaStatus, string> = {
  观察: "border-status-observe/30 bg-status-observe/10 text-status-observe",
  假设: "border-status-hypothesis/30 bg-status-hypothesis/10 text-status-hypothesis",
  验证中:
    "border-status-validating/30 bg-status-validating/10 text-status-validating",
  MVP候选: "border-status-mvp/30 bg-status-mvp/10 text-status-mvp",
  归档: "border-status-archived/30 bg-status-archived/10 text-status-archived",
}

const VERDICT_STYLES: Record<Verdict, { label: string; className: string }> = {
  go: {
    label: "Go",
    className: "border-verdict-go/30 bg-verdict-go/10 text-verdict-go",
  },
  // Kill 的界面语言是"学到了"，不是"失败/放弃"（宪法原则 7）
  kill: {
    label: "学到了",
    className:
      "border-verdict-learned/30 bg-verdict-learned/10 text-verdict-learned",
  },
}

export function StatusBadge({
  status,
  className,
}: {
  status: IdeaStatus
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        STATUS_STYLES[status],
        className
      )}
    >
      {status}
    </span>
  )
}

export function VerdictBadge({
  verdict,
  className,
}: {
  verdict: Verdict
  className?: string
}) {
  const style = VERDICT_STYLES[verdict]
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        style.className,
        className
      )}
    >
      {style.label}
    </span>
  )
}
