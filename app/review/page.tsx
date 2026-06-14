import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { externalConfigured } from "@/lib/external";
import { AppNav } from "@/components/app-nav";
import { RecurringSignals } from "../capture/recurring-signals";
import { ExternalRadar } from "./external-radar";

export const dynamic = "force-dynamic";

async function countSince(
  userId: string,
  fromIso: string,
  toIso?: string
): Promise<number> {
  let q = supabaseAdmin
    .from("observations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", fromIso);
  if (toIso) q = q.lt("created_at", toIso);
  const { count } = await q;
  return count ?? 0;
}

export default async function ReviewPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user!.id;

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const weekAgo = new Date(now - 7 * day).toISOString();
  const twoWeeksAgo = new Date(now - 14 * day).toISOString();

  const [thisWeek, lastWeek, total] = await Promise.all([
    countSince(userId, weekAgo),
    countSince(userId, twoWeeksAgo, weekAgo),
    countSince(userId, "1970-01-01T00:00:00.000Z"),
  ]);

  const stats = [
    { label: "本周新增", value: thisWeek },
    { label: "上周", value: lastWeek },
    { label: "累计", value: total },
  ];

  return (
    <div className="min-h-screen">
      <AppNav />
      <main className="animate-fade-up mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">发现</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            方向不是想出来的，是从你反复的观察里浮现的。先看节奏，再让反复主题逼成方向。
          </p>
        </header>

        <div className="mb-8 grid grid-cols-3 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg border bg-card p-4">
              <div className="font-mono text-2xl tabular-nums">{s.value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>

        <ExternalRadar enabled={externalConfigured()} />

        {total < 3 ? (
          <p className="text-sm text-muted-foreground">
            素材还太少。多去捕捉页随手记、或用上面的外部雷达拉点信号，反复的主题才会浮现出来。
          </p>
        ) : (
          <RecurringSignals />
        )}
      </main>
    </div>
  );
}
