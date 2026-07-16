"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/customer-view", label: "课题" },
  { href: "/customer-view/library", label: "证据库" },
  { href: "/customer-view/inbox", label: "候选收件箱" },
  { href: "/customer-view/topics", label: "定期主题" },
  { href: "/customer-view/patterns", label: "模式报告" },
];

export function CustomerNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto border-b bg-card px-4 sm:px-8 lg:px-12">
      {LINKS.map((link) => {
        const active =
          link.href === "/customer-view"
            ? pathname === link.href || /^\/customer-view\/[^/]+$/.test(pathname)
            : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={
              "shrink-0 border-b-2 px-3 py-3 text-xs transition-colors " +
              (active
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground")
            }
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
