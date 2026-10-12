"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { generateDigestDetailAction } from "./actions";

/** 详细报告还没写：点了才写（二三十秒），写好刷新。写过的再点就是重写。 */
export function DigestDetailButton({ date, rewrite }: { date: string; rewrite?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="text-sm">
      <Button
        variant={rewrite ? "ghost" : "outline"}
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const r = await generateDigestDetailAction(date);
            if (r.ok) router.refresh();
            else setError(r.message);
          })
        }
      >
        {pending ? "在把今天最重要的几件事一件件理清楚，二三十秒……" : rewrite ? "重写详细报告" : "看详细报告（现写，二三十秒）"}
      </Button>
      {error && <p className="mt-2 text-destructive">{error}</p>}
    </div>
  );
}
