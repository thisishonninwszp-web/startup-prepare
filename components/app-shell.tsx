"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  Archive,
  BookOpen,
  Brain,
  Building2,
  CloudMoon,
  Compass,
  Download,
  FolderKanban,
  Home,
  Inbox,
  Library,
  LogOut,
  Menu,
  MessagesSquare,
  NotebookText,
  Radar,
  RotateCcw,
  ScanSearch,
  Settings,
  Target,
  UserCircle,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { NAV_GROUPS, isActiveRoute } from "./app-navigation";

const ICONS: Record<string, LucideIcon> = {
  "/dashboard": Home,
  "/workbench": FolderKanban,
  "/capture": Inbox,
  "/review": Radar,
  "/ideas": Library,
  "/learnings": Archive,
  "/reality": ScanSearch,
  "/customer-view": Users,
  "/retrospectives": RotateCcw,
  "/dreams": CloudMoon,
  "/reasoning": Brain,
  "/council": MessagesSquare,
  "/patterns": Activity,
  "/life": Compass,
  "/profile": UserCircle,
  "/knowledge": BookOpen,
  "/companies": Building2,
  "/company-kb": NotebookText,
  "/outreach": Target,
  "/settings/ai": Settings,
};

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function signOut() {
    setSignOutError(null);
    const { error } = await createClient().auth.signOut();
    if (error) {
      console.error("退出登录失败", error);
      setSignOutError("退出失败，请重试");
      return;
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 flex h-14 items-center border-b bg-background/95 px-4 backdrop-blur md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="grid size-9 place-items-center rounded-md border bg-card"
          aria-label="打开导航"
          aria-expanded={open}
        >
          <Menu className="size-4" />
        </button>
        <Link href="/dashboard" className="ml-3 text-sm font-semibold tracking-tight">
          IdeaOS
        </Link>
        <span className="ml-auto text-xs text-muted-foreground">
          {NAV_GROUPS.flatMap((group) => group.items).find((item) =>
            isActiveRoute(pathname, item.href)
          )?.label ?? ""}
        </span>
      </header>

      {open && (
        <button
          type="button"
          aria-label="关闭导航"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-[2px] md:hidden"
        />
      )}

      <aside
        className={
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-card transition-transform duration-300 ease-out md:translate-x-0 " +
          (open ? "translate-x-0 shadow-2xl" : "-translate-x-full")
        }
      >
        <div className="flex h-16 items-center border-b px-5">
          <Link href="/dashboard" className="font-semibold tracking-[-0.02em]">
            IdeaOS
          </Link>
          <span className="ml-2 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Reality lab
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="ml-auto grid size-8 place-items-center rounded-md hover:bg-muted md:hidden"
            aria-label="关闭导航"
          >
            <X className="size-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-5">
          {NAV_GROUPS.map((group, groupIndex) => (
            <div key={group.label} className={groupIndex > 0 ? "mt-7" : ""}>
              <div className="mb-2 px-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {group.label}
              </div>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const active = isActiveRoute(pathname, item.href);
                  const Icon = ICONS[item.href];
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={
                        "group flex items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors " +
                        (active
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground")
                      }
                    >
                      <Icon className="size-4 shrink-0" strokeWidth={1.7} />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t p-3">
          <Link
            href="/settings/ai"
            className="mb-1 flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Settings className="size-4" strokeWidth={1.7} />
            AI 诊断
          </Link>
          <Link
            href="/settings/export"
            className="mb-1 flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Download className="size-4" strokeWidth={1.7} />
            数据导出
          </Link>
          {signOutError && (
            <p className="mb-2 px-2 text-xs text-destructive" role="alert">
              {signOutError}
            </p>
          )}
          <button
            type="button"
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="size-4" strokeWidth={1.7} />
            退出登录
          </button>
        </div>
      </aside>

      <div className="min-w-0 md:pl-64">{children}</div>
    </div>
  );
}
