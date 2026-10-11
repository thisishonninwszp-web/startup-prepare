"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { analyzeSignal } from "../actions";

/**
 * 第一次打开详情页时自动写深读，写完存下、刷新页面。
 * 之后再打开就直接读存好的，不会再花一次钱。
 */
export function AnalysisLoader({ id }: { id: string }) {
  const router = useRouter();
  const started = useRef(false);
  const [state, setState] = useState<"loading" | "failed">("loading");
  const [message, setMessage] = useState("");

  const run = async () => {
    setState("loading");
    const result = await analyzeSignal(id);
    if (result.ok) router.refresh();
    else {
      setMessage(result.message);
      setState("failed");
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run();
    // 只在第一次挂载时跑一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === "failed") {
    return (
      <div className="text-sm leading-7">
        <p className="text-destructive">{message}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => void run()}>
          再试一次
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">正在读原文、写报告，大约 5 到 10 秒……</p>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-4/6" />
    </div>
  );
}
