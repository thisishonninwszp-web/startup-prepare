"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { GapSide } from "@/lib/domains/signals/gaps-shared";
import type { GapImage } from "@/lib/domains/signals/images";
import { drawGapImageAction } from "../actions";

/** 出一张配图：AI 生成的示意图，点了才出；出不来就给出图提示词，他自己贴进网页版 GPT。disabled 是迁移没跑时的那句话。 */
export function Illustration({
  signalId,
  side,
  initial,
  disabled,
}: {
  signalId: string;
  side: GapSide;
  initial: GapImage | null;
  disabled?: string;
}) {
  const [image, setImage] = useState<GapImage | null>(initial);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const draw = () =>
    startTransition(async () => {
      setError(null);
      const result = await drawGapImageAction(signalId, side);
      if (result.ok) {
        setImage(result.image);
        setPrompt(null);
      } else {
        setError(result.message);
        setPrompt(result.prompt ?? null);
      }
    });
  if (disabled) return <p className="text-sm leading-7 text-muted-foreground">{disabled}</p>;
  return (
    <div className="space-y-2">
      {image && (
        <div className="space-y-1">
          <Image src={image.url} alt="AI 生成的示意图" width={240} height={320} unoptimized className="rounded-md border border-border" />
          <p className="text-xs leading-6 text-muted-foreground">
            AI 生成的示意图，不是实拍、不是产品截图。图里要是冒出了字或 logo，别拿去用，重出一张。
            <a href={image.url} target="_blank" rel="noopener noreferrer" className="ml-1 text-primary underline-offset-4 hover:underline">
              打开原图（右键保存）↗
            </a>
          </p>
        </div>
      )}
      <Button size="sm" variant="outline" disabled={pending} onClick={draw}>
        {pending ? "在出图（十秒左右）…" : image ? "再出一张" : "出一张配图"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {prompt && (
        <div className="space-y-1">
          <p className="text-sm leading-7 text-muted-foreground">这次没出成。把下面这段复制进网页版 GPT，自己出一张：</p>
          <Textarea readOnly value={prompt} rows={4} />
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(prompt);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? "复制好了" : "复制"}
          </Button>
        </div>
      )}
    </div>
  );
}
