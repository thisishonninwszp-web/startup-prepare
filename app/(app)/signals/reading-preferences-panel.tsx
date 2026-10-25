import Link from "next/link";
import type { ReadingPreferencesState } from "@/lib/domains/signals/reading-preferences-shared";
import { StoryPreferenceButtons } from "./story-preference-buttons";

export function ReadingPreferencesPanel({ state }: { state: ReadingPreferencesState }) {
  return (
    <details className="my-6 rounded-lg border border-border px-4 py-3">
      <summary className="cursor-pointer text-sm font-medium">关注与静音管理{state.status === "ready" && state.preferences.length > 0 ? `（${state.preferences.length} 件）` : ""}</summary>
      <p className="mt-2 text-xs leading-6 text-muted-foreground">主动关注会持续追踪；静音和停止关注会覆盖自动追踪。恢复默认后，系统会重新按你的标记、判断和阅读记录追踪。</p>
      {state.status === "missing-schema" ? (
        <p role="status" className="mt-2 text-xs text-muted-foreground">关注与静音尚未启用，请联系维护者完成数据库更新。阅读其他内容不受影响。</p>
      ) : state.preferences.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">还没有主动设置。在新闻展开区或详情页可以关注或静音一件事。</p>
      ) : (
        <ul className="mt-3 space-y-4">
          {state.preferences.map((p) => <li key={p.event_key} className="border-t border-border pt-3">
            <p className="text-sm"><span className="mr-2 text-xs text-muted-foreground">{p.preference === "follow" ? "主动关注" : "已静音"}</span><Link className="hover:text-primary" href={`/signals/${p.signal_id}`}>{p.event_label || p.title || "查看新闻"}</Link></p>
            <StoryPreferenceButtons signalId={p.signal_id} event={p.event_label} initial={p} />
          </li>)}
        </ul>
      )}
    </details>
  );
}
