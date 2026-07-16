"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { archiveDreamCase } from "./actions";

export function DreamDeleteButton({ caseId }: { caseId: string }) {
  const [pending, startTransition] = useTransition();

  function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("确认删除这个梦想吗？删除后无法恢复。")) return;
    startTransition(async () => {
      await archiveDreamCase(caseId);
    });
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={pending}
      className="absolute right-4 top-4 z-10 grid size-8 place-items-center rounded-full bg-stone-100/80 text-stone-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 disabled:opacity-50"
      aria-label="删除梦想"
    >
      <Trash2 className="size-3.5" />
    </button>
  );
}
