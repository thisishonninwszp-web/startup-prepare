"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ExternalLink, X } from "lucide-react";
import { reviewCustomerMaterial } from "../actions";
import type { CustomerMaterialListItem } from "../queries";

export function CustomerInbox({
  initial,
}: {
  initial: CustomerMaterialListItem[];
}) {
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function review(item: CustomerMaterialListItem, keep: boolean) {
    setBusy(item.id);
    setError(null);
    try {
      await reviewCustomerMaterial(
        item.case_id,
        item.id,
        keep ? "kept" : "excluded"
      );
      setItems((current) =>
        current.filter(
          (row) => !(row.id === item.id && row.case_id === item.case_id)
        )
      );
    } catch (caught) {
      console.error("审核顾客材料失败", caught);
      setError(caught instanceof Error ? caught.message : "审核失败");
    } finally {
      setBusy(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
        没有等待审核的材料。
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {items.map((item) => (
        <article key={`${item.case_id}:${item.id}`} className="rounded-lg border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Link
                href={`/customer-view/${item.case_id}`}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {item.case_title}
              </Link>
              <h2 className="mt-1 text-sm font-medium">
                {item.title?.trim() || item.source}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {item.source_url && (
                <a
                  href={item.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="grid size-8 place-items-center rounded-md border text-muted-foreground hover:bg-muted"
                  aria-label="打开来源"
                >
                  <ExternalLink className="size-3.5" />
                </a>
              )}
              <button
                type="button"
                onClick={() => review(item, false)}
                disabled={busy === item.id}
                className="inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs text-muted-foreground hover:bg-muted"
              >
                <X className="size-3.5" />
                排除
              </button>
              <button
                type="button"
                onClick={() => review(item, true)}
                disabled={busy === item.id}
                className="inline-flex h-8 items-center gap-1 rounded-md bg-foreground px-2.5 text-xs text-background"
              >
                <Check className="size-3.5" />
                保留
              </button>
            </div>
          </div>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
            {item.sanitized_text}
          </p>
          <div className="mt-4 flex gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>{item.source}</span>
            {item.market && <span>· {item.market}</span>}
          </div>
        </article>
      ))}
    </div>
  );
}
