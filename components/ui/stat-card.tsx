import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * 统一的数据卡：mono 数字 + 说明。数值一律 Geist Mono（数据/编号规范）。
 */
export function StatCard({
  label,
  value,
  hint,
  className,
}: {
  label: string
  value: ReactNode
  hint?: string
  className?: string
}) {
  return (
    <div className={cn("rounded-lg border bg-card p-4", className)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
