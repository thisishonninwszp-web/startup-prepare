import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * 全站唯一的页面容器（宪法 UI 铁律 4）。
 * 三档宽度取代任意 max-w-*：
 *  - narrow: 表单 / 访谈流
 *  - default: 列表 / 详情
 *  - wide: dashboard / 看板
 */
const WIDTHS = {
  narrow: "max-w-2xl",
  default: "max-w-4xl",
  wide: "max-w-6xl",
} as const

export function PageContainer({
  width = "default",
  className,
  children,
}: {
  width?: keyof typeof WIDTHS
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn("mx-auto px-4 py-8 md:px-8", WIDTHS[width], className)}
    >
      {children}
    </div>
  )
}
