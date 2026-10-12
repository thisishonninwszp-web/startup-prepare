"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { generateWeeklyAction } from "../actions";

/** 周报还没写：打开时自动写一次（十来秒），写好刷新。失败了给个按钮再试；regenerate 时只是一个按钮。 */
export function WeeklyLoader({ weekStart, regenerate }: { weekStart: string; regenerate?: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "writing" | "failed">(regenerate ? "idle" : "writing");
  const [message, setMessage] = useState<string | null>(null);
  const started = useRef(false);

  const run = async () => {
    setState("writing");
    const result = await generateWeeklyAction(weekStart);
    if (result.ok) {
      setState("idle");
      router.refresh();
    } else {
      setMessage(result.message);
      setState("failed");
    }
  };

  useEffect(() => {
    if (regenerate || started.current) return;
    started.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === "writing") {
    return <p className="text-sm leading-7 text-muted-foreground">在把七天的报告连起来看，十来秒……</p>;
  }
  if (state === "idle") {
    return (
      <Button variant="ghost" size="sm" onClick={() => void run()}>
        重写这一周
      </Button>
    );
  }
  return (
    <div className="text-sm leading-7 text-muted-foreground">
      <p>周报这次没写出来：{message}</p>
      <Button variant="outline" size="sm" className="mt-2" onClick={() => void run()}>
        再试一次
      </Button>
    </div>
  );
}
