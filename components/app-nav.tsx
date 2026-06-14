"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const LINKS = [
  { href: "/capture", label: "捕捉" },
  { href: "/review", label: "发现" },
  { href: "/ideas", label: "想法库" },
  { href: "/learnings", label: "复盘" },
];

/** 全局顶部导航：捕捉 / 想法库 / 复盘 + 登出。当前页高亮。 */
export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex items-center gap-2 px-4 py-3 sm:gap-4 sm:px-6">
        <Link href="/capture" className="font-semibold">
          IdeaOS
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {LINKS.map((l) => {
            const active =
              pathname === l.href || pathname.startsWith(l.href + "/");
            return (
              <Link
                key={l.href}
                href={l.href}
                className={
                  "rounded-md px-2.5 py-1.5 transition-colors " +
                  (active
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/60")
                }
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={signOut}
          className="ml-auto text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          登出
        </button>
      </div>
    </header>
  );
}
