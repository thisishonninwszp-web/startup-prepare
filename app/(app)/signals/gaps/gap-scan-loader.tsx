"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { runGapRechecksAction, runGapScanAction } from "../actions";

/**
 * 清单页打开时：今天还没扫就先扫一轮，再把满一个月的几条重查一遍，都好了刷新。
 * 两步各自一个请求（各有 60 秒），扫和重查挤在一个请求里容易超时。
 */
export function GapScanLoader({ scan, dueCount, batch }: { scan: boolean; dueCount: number; batch: number }) {
  const router = useRouter();
  const [state, setState] = useState<"scanning" | "rechecking" | "failed">(scan ? "scanning" : "rechecking");
  const [message, setMessage] = useState<string | null>(null);
  const started = useRef(false);

  const run = async () => {
    if (scan) {
      setState("scanning");
      const result = await runGapScanAction();
      if (!result.ok) {
        setMessage(result.message);
        setState("failed");
        return;
      }
    }
    if (dueCount > 0) {
      setState("rechecking");
      const result = await runGapRechecksAction();
      if (!result.ok) {
        setMessage(result.message);
        setState("failed");
        return;
      }
    }
    router.refresh();
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === "failed") {
    return (
      <div className="mb-8 text-sm leading-7 text-muted-foreground">
        <p>这次没弄完：{message}</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={() => void run()}>
          再试一次
        </Button>
      </div>
    );
  }
  return (
    <p className="mb-8 text-sm leading-7 text-muted-foreground">
      {state === "scanning"
        ? "在翻最近一天的中文、美国消息，挑讲产品和服务的几条，再上网查日本有没有……大概半分钟。"
        : dueCount > batch
          ? `有 ${dueCount} 条进清单满一个月了，今天先重查最早的 ${batch} 条，看这边现在有没有……`
          : `有 ${dueCount} 条进清单满一个月了，在重查这边现在有没有……`}
    </p>
  );
}
