"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { activeHref, SIGNALS_NAV as GROUPS } from "./nav-shared";

export function SignalsNav() {
  const pathname = usePathname() ?? "/signals";
  const active = activeHref(pathname);
  const group = GROUPS.find((g) => g.pages.some((p) => p.href === active)) ?? GROUPS[0];
  return (
    <nav aria-label="外部信号" className="mx-auto max-w-2xl px-4 pt-6 md:px-8">
      <ul className="flex flex-wrap gap-x-1 gap-y-1 border-b border-border text-sm">
        {GROUPS.map((g) => (
          <li key={g.label}>
            <Link
              href={g.pages[0].href}
              className={cn(
                "-mb-px inline-block border-b-2 px-2 pb-2 transition-colors duration-150",
                g === group ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {g.label}
            </Link>
          </li>
        ))}
      </ul>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 px-2 text-sm">
        {group.pages.map((p) => (
          <li key={p.href}>
            <Link
              href={p.href}
              aria-current={p.href === active ? "page" : undefined}
              className={cn(
                "transition-colors duration-150",
                p.href === active ? "font-medium text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {p.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
