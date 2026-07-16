"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/retrospectives", label: "复盘首页" },
  { href: "/retrospectives/settings", label: "设置" },
];

export function RetroNav() {
  const pathname = usePathname();
  return (
    <div className="border-b bg-card/80 px-4 backdrop-blur sm:px-8 lg:px-12">
      <nav className="mx-auto flex h-12 max-w-6xl items-center gap-6">
        {ITEMS.map((item) => {
          const active =
            item.href === "/retrospectives"
              ? pathname === item.href
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                "flex h-full items-center border-b-2 text-xs transition-colors " +
                (active
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground")
              }
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
