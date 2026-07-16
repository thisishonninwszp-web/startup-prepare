"use client"

import { useEffect, useRef, useState } from "react"

import { Button, type ButtonProps } from "@/components/ui/button"

/**
 * 不可逆动作（Go/Kill/删除）的统一确认交互（宪法 UI 铁律 5）。
 * 第一次点击进入确认态，3 秒内再点才执行；避免弹窗打断心流。
 */
export function ConfirmButton({
  confirmLabel = "再点一次确认",
  children,
  onClick,
  variant,
  ...props
}: ButtonProps & { confirmLabel?: string }) {
  const [arming, setArming] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  return (
    <Button
      {...props}
      variant={arming ? "destructive" : variant}
      onClick={(event) => {
        if (!arming) {
          event.preventDefault()
          setArming(true)
          timer.current = setTimeout(() => setArming(false), 3000)
          return
        }
        if (timer.current) clearTimeout(timer.current)
        setArming(false)
        onClick?.(event)
      }}
    >
      {arming ? confirmLabel : children}
    </Button>
  )
}
