"use client";

import { useEffect, useRef } from "react";
import { recordReadingOpenAction } from "./reading-session-actions";

/**
 * 被动记录（迁移 100，经用户同意 2026-10-23）：放在一条新闻的 <summary> 里，所在的 <details> 被展开时记一次「点开过」。
 * 本次展开先更新界面，保存结果再同步给阅读状态；失败明确标为未同步，重新展开可重试。
 */
export function TrackOpen({ signalId }: { signalId: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const details = ref.current?.closest("details");
    if (!details) return;
    let sent = false;
    const onToggle = () => {
      if (!details.open || sent) return;
      sent = true;
      window.dispatchEvent(new CustomEvent("signal-opened", { detail: { signalId, saved: false } }));
      void recordReadingOpenAction(signalId).then((result) => {
        if (result.ok) window.dispatchEvent(new CustomEvent("signal-opened", { detail: { signalId, saved: true } }));
        else {
          sent = false;
          window.dispatchEvent(new CustomEvent("signal-open-failed", { detail: signalId }));
        }
      }).catch(() => {
        sent = false;
        window.dispatchEvent(new CustomEvent("signal-open-failed", { detail: signalId }));
      });
    };
    details.addEventListener("toggle", onToggle);
    return () => details.removeEventListener("toggle", onToggle);
  }, [signalId]);
  return <span ref={ref} hidden />;
}
