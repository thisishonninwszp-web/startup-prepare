import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { AppNav } from "@/components/app-nav";
import { daysSince, daysUntilLock } from "../ideas/types";

export const dynamic = "force-dynamic";

const ENTRIES = [
  { href: "/capture", title: "捕捉", desc: "随手记录今天的观察" },
  { href: "/ideas", title: "想法库", desc: "把观察推进成假设并验证" },
  { href: "/learnings", title: "复盘", desc: "回看归档想法里的判断力" },
];

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user!.id;

  // 正在"验证中"的想法，越久没动越靠前——强制出口的主动推动。
  const { data: validating } = await supabaseAdmin
    .from("ideas")
    .select("id, title, last_activity_at")
    .eq("user_id", userId)
    .eq("status", "验证中")
    .order("last_activity_at", { ascending: true });

  const items = validating ?? [];

  return (
    <div className="min-h-screen">
      <AppNav />
      <main className="animate-fade-up mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">今天该接触谁</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            分析跨不过同理心鸿沟，只有真实接触能。越靠上的想法，越久没有新的真实接触。
          </p>
        </header>

        {items.length === 0 ? (
          <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
            现在没有正在验证的想法。去{" "}
            <Link
              href="/ideas"
              className="text-foreground underline underline-offset-4"
            >
              想法库
            </Link>{" "}
            把一个想法拖进“验证中”，或先去{" "}
            <Link
              href="/capture"
              className="text-foreground underline underline-offset-4"
            >
              捕捉
            </Link>{" "}
            记录观察。
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((idea) => (
              <ContactRow
                key={idea.id}
                id={idea.id}
                title={idea.title}
                lastActivityAt={idea.last_activity_at}
              />
            ))}
          </ul>
        )}

        {/* 次级导航 */}
        <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {ENTRIES.map((e) => (
            <Link
              key={e.href}
              href={e.href}
              className="rounded-lg border bg-card p-4 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md"
            >
              <div className="text-sm font-medium">{e.title}</div>
              <div className="mt-1 text-xs text-muted-foreground">{e.desc}</div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}

function ContactRow({
  id,
  title,
  lastActivityAt,
}: {
  id: string;
  title: string | null;
  lastActivityAt: string;
}) {
  const left = daysUntilLock(lastActivityAt);
  const idle = daysSince(lastActivityAt);

  let badge: { text: string; cls: string };
  if (left <= 0) {
    badge = {
      text: "已锁定 · 去接触",
      cls: "border-red-300 bg-red-50 text-red-700",
    };
  } else if (left <= 1) {
    badge = {
      text: `还剩 ${left} 天`,
      cls: "border-orange-300 bg-orange-50 text-orange-700",
    };
  } else {
    badge = {
      text: `还剩 ${left} 天`,
      cls: "border-border bg-muted text-muted-foreground",
    };
  }

  return (
    <li>
      <Link
        href={`/ideas/${id}`}
        className="flex items-center gap-4 rounded-lg border bg-card p-4 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md"
      >
        <span className="min-w-0 flex-1 truncate text-sm">
          {title?.trim() || "（无标题）"}
        </span>
        <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
          {idle} 天没动
        </span>
        <span
          className={
            "shrink-0 rounded-full border px-2.5 py-1 text-xs " + badge.cls
          }
        >
          {badge.text}
        </span>
      </Link>
    </li>
  );
}
