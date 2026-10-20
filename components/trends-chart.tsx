"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TRENDS_MAX_WORDS, trendsEmbedUrl, trendsExploreUrl, trendsWords } from "@/lib/trends";

/**
 * 这五年在日本有多少人在 Google 上搜这个说法：点了才嵌 Google 趋势自己画的图（不点不去连 Google）。
 * 可以再加几个说法一起比（最多 5 个）—— 一个说法单看只有走势，放在一起才看得出哪个麻烦搜的人多。
 */
export function TrendsChart({ words, label }: { words: string[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState(() => trendsWords(words));
  const [extra, setExtra] = useState("");
  if (list.length === 0) return null;

  if (!open) {
    return (
      <Button variant="ghost" size="sm" className="h-auto min-h-8 whitespace-normal px-2 py-1 text-left text-xs" onClick={() => setOpen(true)}>
        {label ?? `看这五年有多少人在 Google 上搜「${list.join("」「")}」`}
      </Button>
    );
  }

  const add = () => {
    const next = trendsWords([...list, extra]);
    setList(next);
    setExtra("");
  };

  return (
    <figure className="space-y-2 text-xs">
      <figcaption>
        <span className="text-sm font-medium">这五年在日本，Google 上搜「{list.join("」「")}」的走势</span>
        <span className="block text-muted-foreground">Google 画这张图要十几二十秒，先空白一会儿是正常的。</span>
      </figcaption>
      <iframe
        key={list.join("|")}
        src={trendsEmbedUrl(list)}
        title={`Google 趋势：${list.join("、")}，日本，近 5 年`}
        loading="lazy"
        className="h-[360px] w-full rounded-md border border-border bg-card"
      />
      <div className="flex flex-wrap items-center gap-2">
        {list.length > 1 &&
          list.map((w) => (
            <Button key={w} variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setList(list.filter((x) => x !== w))}>
              {w} ×
            </Button>
          ))}
        {list.length < TRENDS_MAX_WORDS && (
          <span className="flex items-center gap-2">
            <Input
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && extra.trim()) add();
              }}
              placeholder="再加一个说法一起比"
              maxLength={60}
              className="h-8 w-44 text-xs"
            />
            <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" disabled={!extra.trim()} onClick={add}>
              加进来
            </Button>
          </span>
        )}
      </div>
      <p className="leading-6 text-muted-foreground">
        Google 给的不是次数：这五年里搜得最多的那一周记作 100，别的周按它折算。看的是走势 —— 这几年多了还是少了、哪几周突然冒出来；
        几个说法放一起比，才看得出哪个麻烦搜的人多。搜的人太少时 Google 会说数据不足，这本身也是一个信号。
        图是 Google 直接画、嵌进来的，程序不去抓。
        <a href={trendsExploreUrl(list)} target="_blank" rel="noopener noreferrer" className="ml-1 text-primary underline-offset-4 hover:underline">
          图没出来（Google 有时会拒绝，过一会儿再开），去 Google 趋势看 ↗
        </a>
      </p>
    </figure>
  );
}
