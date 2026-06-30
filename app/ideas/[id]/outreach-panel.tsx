"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { generateIdeaOutreachStrategy } from "@/app/outreach/actions";
import type { OutreachStrategy } from "@/lib/ai";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="rounded border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted"
    >
      {copied ? "已复制" : "复制"}
    </button>
  );
}

export function OutreachPanel({
  ideaId,
  initialStrategy = null,
}: {
  ideaId: string;
  initialStrategy?: OutreachStrategy | null;
}) {
  const [strategy, setStrategy] = useState<OutreachStrategy | null>(initialStrategy);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const result = await generateIdeaOutreachStrategy(ideaId);
      setStrategy(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失败，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          综合假设、客户代理、知识库，生成可直接执行的触达计划。
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={`/outreach/new?use_case=startup&source_id=${ideaId}&source_type=idea`}
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            深入规划 →
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={generate}
            disabled={loading}
          >
            {loading ? "生成中…" : strategy ? "重新生成" : "AI 生成"}
          </Button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {strategy && (
        <div className="space-y-3">
          {/* 四维卡片 */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* 对的人 */}
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center gap-2 font-medium text-sm">
                <span>👤</span>
                <span>对的人</span>
              </div>
              <p className="text-sm">{strategy.right_person.profile}</p>
              {strategy.right_person.signals.length > 0 && (
                <ul className="space-y-1">
                  {strategy.right_person.signals.map((s, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                      <span className="shrink-0 mt-0.5">·</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* 对的地方 */}
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center gap-2 font-medium text-sm">
                <span>📍</span>
                <span>对的地方</span>
              </div>
              {strategy.right_place.map((p, i) => (
                <div key={i} className="space-y-0.5">
                  <p className="text-sm font-medium">{p.channel}</p>
                  <p className="text-xs text-muted-foreground">{p.specific}</p>
                </div>
              ))}
            </div>

            {/* 对的时机 */}
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center gap-2 font-medium text-sm">
                <span>⏱</span>
                <span>对的时机</span>
              </div>
              <p className="text-sm font-medium">{strategy.right_time.trigger}</p>
              {strategy.right_time.notes && (
                <p className="text-xs text-muted-foreground">{strategy.right_time.notes}</p>
              )}
            </div>

            {/* 对的信息（预览） */}
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center gap-2 font-medium text-sm">
                <span>✉️</span>
                <span>为什么这个开场有效</span>
              </div>
              <p className="text-sm">{strategy.right_message.hook_explanation}</p>
            </div>
          </div>

          {/* 消息草稿 */}
          <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">消息草稿（可直接使用）</span>
              <CopyButton text={strategy.right_message.draft} />
            </div>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {strategy.right_message.draft}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
