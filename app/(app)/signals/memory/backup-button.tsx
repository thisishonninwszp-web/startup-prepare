"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { exportThisMonthAction } from "../memory-actions";

/** 现在就把这个月（到今天为止）打包一份。 */
export function BackupButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  return (
    <div className="mt-2">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            try {
              const r = await exportThisMonthAction();
              setNote(r.ok ? `打包好了：这个月到今天 ${r.rows} 条` : r.message);
              if (r.ok) router.refresh();
            } catch {
              setNote("没连上服务器（网络断了一下），过一会儿再试。");
            }
          })
        }
      >
        {pending ? "在打包……" : "现在打包这个月（到今天为止）"}
      </Button>
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}
