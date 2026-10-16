"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { runJobSearchAction } from "./actions";

/** 今天还没搜：打开页面时搜一轮（三四十秒），好了刷新。auto=false 时只给一个"再搜一次"。 */
export function JobSearchLoader({ auto }: { auto: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "running" | "failed" | "done">(auto ? "running" : "idle");
  const [message, setMessage] = useState<string | null>(null);
  const started = useRef(false);

  const run = async () => {
    setState("running");
    const r = await runJobSearchAction();
    if (!r.ok) {
      setMessage(r.message);
      setState("failed");
      return;
    }
    setMessage(`${r.kept > 0 ? `新留下 ${r.kept} 条。` : "今天没搜到新的。"}${r.skipped.length > 0 ? ` ${r.skipped.join("；")}。` : ""}`);
    setState("done");
    router.refresh();
  };

  useEffect(() => {
    if (!auto || started.current) return;
    started.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === "running") {
    return <p className="text-sm leading-7 text-muted-foreground">在按你的条件搜四类岗位，一页页读招聘页……大概半分钟到一分钟。</p>;
  }
  return (
    <div className="text-sm leading-7 text-muted-foreground">
      {message && <p>{state === "failed" ? `这次没搜成：${message}` : message}</p>}
      <Button variant="outline" size="sm" className="mt-2" onClick={() => void run()}>
        再搜一次
      </Button>
    </div>
  );
}
