"use client";

import { useEffect, useRef } from "react";
import { recordOpenAction } from "./memory-actions";

/**
 * 被动记录（迁移 100，经用户同意 2026-10-23）：放在一条新闻的 <summary> 里，所在的 <details> 被展开时记一次「点开过」。
 * 他什么都不用点；记不上（没登录、迁移没跑、网断了）就算了，不打扰他看新闻。一次打开页面里同一条只报一次。
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
      recordOpenAction(signalId).catch(() => {});
    };
    details.addEventListener("toggle", onToggle);
    return () => details.removeEventListener("toggle", onToggle);
  }, [signalId]);
  return <span ref={ref} hidden />;
}
