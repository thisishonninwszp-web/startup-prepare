"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { computeSlowWindAction } from "../actions";

/** 看一次：你手上的东西（差距清单、想法库）各顺着、逆着哪几个慢变量（三四十秒）。 */
export function WindButton({ lastAt }: { lastAt: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <Button
        variant={lastAt ? "outline" : "default"}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const r = await computeSlowWindAction();
            if (r.ok) router.refresh();
            else setError(r.message);
          })
        }
      >
        {pending ? "在一样样对……三四十秒" : lastAt ? `重新看一次（上次：${lastAt.slice(0, 10)}）` : "看看你手上的东西：顺风还是逆风"}
      </Button>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
