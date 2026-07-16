"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { archiveDreamCase } from "./actions";
import { ConfirmButton } from "@/components/ui/confirm-button";

export function DreamDeleteButton({ caseId }: { caseId: string }) {
  const [pending, startTransition] = useTransition();

  function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    startTransition(async () => {
      await archiveDreamCase(caseId);
    });
  }

  return (
    <ConfirmButton
      type="button"
      onClick={handleDelete}
      disabled={pending}
      confirmLabel="确认删除"
      variant="ghost"
      className="absolute right-4 top-4 z-10 h-8 gap-1 rounded-full bg-muted/80 px-2 text-muted-foreground/80 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 disabled:opacity-50"
      aria-label="删除梦想"
    >
      <Trash2 className="size-3.5" />
    </ConfirmButton>
  );
}
