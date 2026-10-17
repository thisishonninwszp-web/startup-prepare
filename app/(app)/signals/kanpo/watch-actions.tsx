"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { rejectMatchAction, removeWatchAction } from "./actions";

export function RemoveWatchButton({ id }: { id: string }) {
  const router = useRouter();
  return (
    <ConfirmButton
      size="sm"
      variant="ghost"
      confirmLabel="再点一次删掉"
      onClick={async () => {
        const r = await removeWatchAction(id);
        if (r.ok) router.refresh();
      }}
    >
      从名单删掉
    </ConfirmButton>
  );
}

/** 「不是这家」：同名但不是名单里那一家（例如同名的日本公司），以后不再挂上来。 */
export function RejectMatchButton({ id, companyKey }: { id: string; companyKey: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await rejectMatchAction(id, companyKey);
            if (!r.ok) setError(r.message);
            else router.refresh();
          })
        }
      >
        不是这家
      </Button>
      {error && <span className="text-xs text-muted-foreground">{error}</span>}
    </>
  );
}
