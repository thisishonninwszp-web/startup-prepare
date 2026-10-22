"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { generateMonthlyAction } from "../actions";

/** 月报还没写：打开时自动写一次（缺的周报先补，三四十秒），写好刷新。失败了给按钮再试；regenerate 时只是一个按钮。 */
export function MonthlyLoader({ month, regenerate, label }: { month: string; regenerate?: boolean; label?: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "writing" | "failed">(regenerate ? "idle" : "writing");
  const [message, setMessage] = useState<string | null>(null);
  const started = useRef(false);

  const run = async () => {
    setState("writing");
    try {
      const result = await generateMonthlyAction(month);
      if (result.ok) {
        setState("idle");
        router.refresh();
      } else {
        setMessage(result.message);
        setState("failed");
      }
    } catch {
      setMessage("没连上服务器（网络断了一下），过一会儿再试。");
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
    return <p className="text-sm leading-7 text-muted-foreground">在把这个月的几份周报连起来看（缺的周报先补写），三四十秒……</p>;
  }
  if (state === "idle") {
    return (
      <Button variant="ghost" size="sm" onClick={() => void run()}>
        {label ?? "重写这个月"}
      </Button>
    );
  }
  return (
    <div className="text-sm leading-7 text-muted-foreground">
      <p>月报这次没写出来：{message}</p>
      <Button variant="outline" size="sm" className="mt-2" onClick={() => void run()}>
        再试一次
      </Button>
    </div>
  );
}
