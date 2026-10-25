"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { preferenceForItem, type ReadingPreference, type ReadingPreferenceValue } from "@/lib/domains/signals/reading-preferences-shared";
import { clearReadingPreferenceAction, setReadingPreferenceAction } from "./reading-preferences-actions";

export function StoryPreferenceButtons({ signalId, event, initial, available = true }: {
  signalId: string;
  event?: string | null;
  initial: ReadingPreference | null;
  available?: boolean;
}) {
  const [preference, setPreference] = useState(initial);
  const [pending, setPending] = useState(false);
  const saving = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  useEffect(() => setPreference(initial), [initial]);

  const save = async (value: ReadingPreferenceValue | null) => {
    if (saving.current) return;
    saving.current = true;
    setPending(true);
    setError(null);
    try {
      const result = value ? await setReadingPreferenceAction(signalId, value)
        : preference ? await clearReadingPreferenceAction(preference.event_key) : null;
      if (!result) return;
      if (!result.ok) { setError(result.message); return; }
      setPreference(preferenceForItem({ signal_id: signalId, event }, result.state.preferences));
      router.refresh();
    } catch {
      setError("没连上服务器，阅读偏好没有保存，请重试。");
    } finally {
      saving.current = false;
      setPending(false);
    }
  };

  if (!available) return <p className="text-xs text-muted-foreground">关注与静音尚未启用。</p>;
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1">
        <Button type="button" size="sm" variant={preference?.preference === "follow" ? "secondary" : "ghost"}
          className="h-7 px-2 text-xs" disabled={pending} aria-pressed={preference?.preference === "follow"}
          onClick={() => save(preference?.preference === "follow" ? "mute" : "follow")}>
          {preference?.preference === "follow" ? "停止关注" : "关注这件事"}
        </Button>
        <Button type="button" size="sm" variant={preference?.preference === "mute" ? "secondary" : "ghost"}
          className="h-7 px-2 text-xs" disabled={pending || preference?.preference === "mute"}
          aria-pressed={preference?.preference === "mute"} onClick={() => save("mute")}>
          {preference?.preference === "mute" ? "已静音" : "静音这件事"}
        </Button>
        {preference && <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={pending} onClick={() => save(null)}>恢复默认</Button>}
      </div>
      {preference?.preference === "follow" && <p className="text-xs text-muted-foreground">你主动关注了这件事；后续消息会进入追踪。</p>}
      {preference?.preference === "mute" && <p className="text-xs text-muted-foreground">已停止追踪；报告里同一事件的内容会收起，仍可主动查看。</p>}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
