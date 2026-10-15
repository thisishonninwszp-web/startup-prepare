"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { researchAtlasAction } from "../actions";

/** 查一批（三四十秒）：空的时候从十件样例开始，之后再找几件。 */
export function ResearchAtlasButton({ mode }: { mode: "seed" | "more" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div>
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setMessage(null);
            const result = await researchAtlasAction(mode);
            if (result.ok) {
              setMessage(
                result.tried === 0
                  ? "这次没有新的可查。"
                  : `这次查了 ${result.tried} 件，收了 ${result.kept} 件${result.kept < result.tried ? "（三样没都查到原文的不收）" : ""}。`
              );
              router.refresh();
            } else setMessage(result.message);
          })
        }
      >
        {pending ? "在一件件上网核实……三四十秒" : mode === "seed" ? "从十件样例开始" : "再找几件"}
      </Button>
      {message && <p className="mt-2 text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}
