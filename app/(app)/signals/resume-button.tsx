"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { PauseKind } from "@/lib/domains/signals/pause-shared";
import { resumeGenerationAction } from "./actions";

/** 停了的那一样旁边的「恢复」：点了再看两周，页面刷新后这一行就不在了。 */
export function ResumeButton({ kind }: { kind: PauseKind }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            try {
              const r = await resumeGenerationAction(kind);
              setMessage(r.message);
              if (r.ok) router.refresh();
            } catch {
              setMessage("没连上服务器，过一会儿再试。");
            }
          })
        }
      >
        恢复
      </Button>
      {message && <span className="text-xs text-muted-foreground">{message}</span>}
    </span>
  );
}
