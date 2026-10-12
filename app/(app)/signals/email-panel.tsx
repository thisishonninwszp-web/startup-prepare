"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { sendTestEmailAction } from "./actions";

/** 早上的提醒邮件：配好了显示发给谁、可以现在发一封试试；没配好说清楚缺什么、去哪配。 */
export function EmailPanel({ to, missing }: { to: string | null; missing: string[] }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  if (!to) {
    return (
      <p className="text-xs leading-6 text-muted-foreground">
        早上的提醒邮件还没配：缺 {missing.join("、")}。在 Gmail 里生成一个「应用专用密码」，填进 .env.local
        和 Vercel 的环境变量（怎么填见 .env.local.example 最后一段），每天早上报告好了就会发到你的邮箱。
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-6 text-muted-foreground">
      <span>每天早上报告好了，会发一封提醒到 {to}。</span>
      <Button
        variant="link"
        size="sm"
        className="h-auto px-0 py-0 text-xs"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await sendTestEmailAction();
            setResult(r.ok ? `发出去了，去 ${r.to} 收一下。` : r.message);
          })
        }
      >
        {pending ? "在发…" : "现在发一封试试"}
      </Button>
      {result && <span className="basis-full">{result}</span>}
    </div>
  );
}
