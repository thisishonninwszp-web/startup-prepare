"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, Search } from "lucide-react";
import type { CustomerMaterialListItem } from "../queries";

export function CustomerLibrary({
  materials,
}: {
  materials: CustomerMaterialListItem[];
}) {
  const [query, setQuery] = useState("");
  const [market, setMarket] = useState("all");
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return materials.filter((item) => {
      if (market !== "all" && item.market !== market) return false;
      if (!needle) return true;
      return `${item.title ?? ""} ${item.sanitized_text} ${item.source} ${
        item.case_title
      }`
        .toLowerCase()
        .includes(needle);
    });
  }, [materials, market, query]);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="relative flex-1">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索顾客原话、场景、来源或课题"
            className="w-full rounded-md border bg-card py-2 pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <select
          value={market}
          onChange={(event) => setMarket(event.target.value)}
          className="rounded-md border bg-card px-3 py-2 text-sm"
        >
          <option value="all">全部市场</option>
          <option value="cn">中国</option>
          <option value="jp">日本</option>
          <option value="en">英语市场</option>
        </select>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {visible.map((item) => (
          <article
            key={`${item.case_id}:${item.id}`}
            className="rounded-lg border bg-card p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <Link
                  href={`/customer-view/${item.case_id}`}
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                >
                  {item.case_title}
                </Link>
                <h2 className="mt-1 text-sm font-medium">
                  {item.title?.trim() || item.source}
                </h2>
              </div>
              {item.source_url && (
                <a
                  href={item.source_url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="打开来源"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="size-4" />
                </a>
              )}
            </div>
            <p className="mt-3 line-clamp-5 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
              {item.sanitized_text}
            </p>
            <div className="mt-4 flex gap-2 font-mono text-[10px] uppercase text-muted-foreground">
              <span>{item.source}</span>
              {item.market && <span>· {item.market}</span>}
              <span>· {item.origin}</span>
            </div>
          </article>
        ))}
      </div>
      {visible.length === 0 && (
        <p className="mt-10 text-center text-sm text-muted-foreground">
          没有匹配的保留材料。
        </p>
      )}
    </div>
  );
}
