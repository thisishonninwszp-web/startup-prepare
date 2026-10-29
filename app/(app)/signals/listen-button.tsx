"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * 听报告：用浏览器自带的朗读，把今天的报告念出来，通勤路上听。不花钱、不用装东西。
 * 一段一段排进去念 —— 有的浏览器一次念太长的一段会念到一半停住。
 */
/** big：邮件里「听」点进来的那一页，一个大按钮。 */
export function ListenButton({ paragraphs, big = false }: { paragraphs: string[]; big?: boolean }) {
  const [state, setState] = useState<"idle" | "playing" | "paused">("idle");
  const [supported, setSupported] = useState(true);
  const queued = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) setSupported(false);
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  if (!supported || paragraphs.length === 0) return null;

  const start = () => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith("zh"));
    queued.current = paragraphs.length;
    for (const text of paragraphs) {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "zh-CN";
      if (voice) u.voice = voice;
      u.rate = 1.05;
      u.onend = () => {
        queued.current -= 1;
        if (queued.current <= 0) setState("idle");
      };
      synth.speak(u);
    }
    setState("playing");
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {state === "idle" && (
        <Button variant={big ? "default" : "outline"} size={big ? "lg" : "sm"} onClick={start}>
          {big ? "▶ 开始听" : "听今天的报告"}
        </Button>
      )}
      {state === "playing" && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            window.speechSynthesis.pause();
            setState("paused");
          }}
        >
          暂停
        </Button>
      )}
      {state === "paused" && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            window.speechSynthesis.resume();
            setState("playing");
          }}
        >
          接着听
        </Button>
      )}
      {state !== "idle" && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            window.speechSynthesis.cancel();
            setState("idle");
          }}
        >
          停
        </Button>
      )}
    </div>
  );
}
