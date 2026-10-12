"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type SectionTab = { key: string; label: string; count: number; content: ReactNode };

/**
 * 五节分页签，一次只看一节。内容都在服务器上渲染好了（forceMount 留在页面里），切换不等网络。
 * 别处的链接（总览里"最值得点开的"、练习卡片里"第几条"）指向 #item-xxx：
 * 找到那一条在哪个页签，切过去、把它展开、滚过去。
 */
export function SectionTabs({ tabs }: { tabs: SectionTab[] }) {
  const [active, setActive] = useState(tabs[0]?.key ?? "");

  useEffect(() => {
    const reveal = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id.startsWith("item-")) return;
      const el = document.getElementById(id);
      const panel = el?.closest<HTMLElement>("[data-tab]");
      if (!el || !panel) return;
      setActive(panel.dataset.tab ?? "");
      // 等页签切过去、元素显示出来再展开和滚动
      requestAnimationFrame(() => {
        if (el instanceof HTMLDetailsElement) el.open = true;
        el.scrollIntoView({ block: "start" });
      });
    };
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, []);

  return (
    <Tabs value={active} onValueChange={setActive}>
      <div className="sticky top-0 z-10 -mx-1 bg-background px-1 py-2">
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          {tabs.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
              <span className="ml-1 font-mono text-xs opacity-70">{t.count}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {tabs.map((t) => (
        <TabsContent key={t.key} value={t.key} forceMount data-tab={t.key} className="data-[state=inactive]:hidden">
          {t.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
