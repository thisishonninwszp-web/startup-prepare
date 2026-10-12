"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { generateDigestAction } from "./actions";

/** 今日总览还没写：打开页面时自动写一次（五六秒），写好刷新。失败了给个按钮再试。 */
export function DigestLoader({ date }: { date: string }) {
  const router = useRouter();
  const [state, setState] = useState<"writing" | "failed">("writing");
  const [message, setMessage] = useState<string | null>(null);
  const started = useRef(false);

  const run = async () => {
    setState("writing");
    const result = await generateDigestAction(date);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === "writing") {
    return <p className="text-sm leading-7 text-muted-foreground">在看今天的五节，写一段总览，五六秒……</p>;
  }
  return (
    <div className="text-sm leading-7 text-muted-foreground">
      <p>总览这次没写出来：{message}</p>
      <Button variant="outline" size="sm" className="mt-2" onClick={() => void run()}>
        再试一次
      </Button>
    </div>
  );
}
