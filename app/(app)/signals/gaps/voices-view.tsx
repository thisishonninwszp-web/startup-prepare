"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { GapSide } from "@/lib/domains/signals/gaps-shared";
import { VOICE_KINDS, voiceCounts, type GapVoices, type VoiceKind } from "@/lib/domains/signals/voices-shared";
import { analyzeGapVoicesAction } from "../actions";

/**
 * 这边有没有人在为这件事头疼：点了才查（三四十秒）。问答网站的提问、吐槽、App Store 差评里的真人原话，
 * 分三种只数次数。只算"有痛"的弱证据 —— 网上抱怨的人不等于会掏钱的人。
 */
export function VoicesView({ signalId, side, here, initial }: { signalId: string; side: GapSide; here: string; initial: GapVoices | null }) {
  const [voices, setVoices] = useState<GapVoices | null>(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = () =>
    startTransition(async () => {
      setError(null);
      const result = await analyzeGapVoicesAction(signalId, side);
      if (result.ok) setVoices(result.analysis);
      else setError(result.message);
    });

  if (!voices) {
    return (
      <div className="mt-1">
        <Button variant="ghost" size="sm" className="h-10 px-2 sm:h-8" disabled={pending} onClick={run}>
          {pending ? `在问答网站、App 差评里找${here}的真人原话……三四十秒` : `${here}这边有人在为这个头疼吗？听一听`}
        </Button>
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  const counts = voiceCounts(voices.quotes);
  return (
    <div className="mt-3 rounded-md bg-muted/50 p-4 text-sm leading-7">
      <p className="font-medium">{here}这边的真人原话</p>
      <p className="text-xs text-muted-foreground">找的是这件麻烦：{voices.pain}</p>
      {voices.quotes.length === 0 ? (
        <p className="mt-2 text-muted-foreground">
          翻了 {voices.searched.pages} 篇网页、{voices.searched.reviews} 条 App 差评，没找到真人在为这件事头疼的原话。可能真的不太痛，也可能只是没搜到。
        </p>
      ) : (
        <>
          <p className="mt-2 font-mono text-xs">
            {(Object.keys(VOICE_KINDS) as VoiceKind[]).map((k) => `${VOICE_KINDS[k]} ${counts[k]}`).join(" · ")}
          </p>
          <ul className="mt-2 space-y-2">
            {voices.quotes.map((q, i) => (
              <li key={i} className="text-sm">
                <span className="mr-1 font-mono text-xs text-muted-foreground">[{VOICE_KINDS[q.kind]}]</span>
                「{q.excerpt}」
                <a href={q.url} target="_blank" rel="noopener noreferrer" className="ml-1 text-xs text-primary underline-offset-4 hover:underline">
                  {q.from === "review" ? `App Store 评论${q.rating ? ` ★${q.rating}` : ""}${q.date ? ` · ${q.date}` : ""}` : q.title || "来源"} ↗
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-3 text-xs leading-6 text-muted-foreground">
        翻了 {voices.searched.pages} 篇网页、{voices.searched.reviews} 条 App 差评。
        {voices.judged ? "每句都请另一个模型看过是不是真人在说这件事。" : "这次裁判没调通，分类是找原话的那个 AI 自己分的。"}
        网上抱怨的人不等于会掏钱的人：这些只算「有痛」的弱证据，不算「愿付钱」。只数次数。
      </p>
      <Button variant="ghost" size="sm" className="mt-1 h-8 px-2 text-xs" disabled={pending} onClick={run}>
        {pending ? "在重新找……三四十秒" : "换一批再找"}
      </Button>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
