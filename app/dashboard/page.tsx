import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AppNav } from "@/components/app-nav";

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

  return (
    <div className="min-h-screen">
      <AppNav />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <p className="mb-6 text-sm text-muted-foreground">{user?.email}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {ENTRIES.map((e) => (
            <Link
              key={e.href}
              href={e.href}
              className="rounded-lg border p-4 transition-colors hover:bg-muted"
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
