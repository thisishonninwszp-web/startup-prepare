import Link from "next/link";
import { RotateCcw, ScanSearch } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { AppShell } from "@/components/app-shell";
import { daysSince, daysUntilLock } from "../ideas/types";
import { listRealityCases } from "../reality/queries";
import {
  getReflectionSettings,
  listDueRetroPredictions,
  listRetroPeriods,
  todayInTimezone,
} from "../retrospectives/queries";
import {
  getMonthlyPeriod,
  getMonthlyReviewDate,
  getWeeklyPeriod,
} from "../retrospectives/types";

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
  const [realityCases, reflectionSettings, retroPeriods, dueRetroPredictions, beliefCountResult, customerCountResult] =
    await Promise.all([
      listRealityCases(userId),
      getReflectionSettings(userId),
      listRetroPeriods(userId),
      listDueRetroPredictions(userId),
      supabaseAdmin
        .from("bayesian_beliefs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .is("archived_at", null),
      supabaseAdmin
        .from("customer_cases")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .is("archived_at", null),
    ]);
  const beliefCount = beliefCountResult.count ?? 0;
  const customerCount = customerCountResult.count ?? 0;
  const dueRealityCases = realityCases.filter(
    (item) =>
      item.review_due_at &&
      new Date(item.review_due_at).getTime() <= Date.now()
  );
  const retroToday = todayInTimezone(reflectionSettings.timezone);
  const weeklyRange = getWeeklyPeriod(
    retroToday,
    reflectionSettings.review_weekday
  );
  const monthlyRange = getMonthlyPeriod(retroToday);
  const weeklyDone = retroPeriods.some(
    (period) =>
      period.period_type === "weekly" &&
      period.period_start === weeklyRange.start &&
      period.period_end === weeklyRange.end &&
      period.status === "completed"
  );
  const monthlyDone = retroPeriods.some(
    (period) =>
      period.period_type === "monthly" &&
      period.period_start === monthlyRange.start &&
      period.period_end === monthlyRange.end &&
      period.status === "completed"
  );
  const weeklyDue = retroToday === weeklyRange.end && !weeklyDone;
  const monthlyDue =
    retroToday ===
      getMonthlyReviewDate(retroToday, reflectionSettings.review_weekday) &&
    !monthlyDone;

  // 最近一次完成的周复盘
  const lastWeeklyRetro = retroPeriods
    .filter((p) => p.period_type === "weekly" && p.status === "completed")
    .sort((a, b) => b.period_end.localeCompare(a.period_end))[0];
  const lastRetroDate = lastWeeklyRetro
    ? Math.floor(
        (Date.now() - new Date(lastWeeklyRetro.period_end).getTime()) /
          (24 * 60 * 60 * 1000)
      )
    : null;

  // 系统状态：有数据时显示
  const hasSystemData =
    beliefCount > 0 ||
    realityCases.length > 0 ||
    customerCount > 0 ||
    lastWeeklyRetro != null;

  // 正在"验证中"的想法，越久没动越靠前——强制出口的主动推动。
  const { data: validating } = await supabaseAdmin
    .from("ideas")
    .select("id, title, last_activity_at")
    .eq("user_id", userId)
    .eq("status", "验证中")
    .order("last_activity_at", { ascending: true });

  const items = validating ?? [];

  // 到期的预测——该用现实对账了（校准回路）。
  const { data: duePreds } = await supabaseAdmin
    .from("predictions")
    .select("id, text, due_at, idea_id, ideas!inner(title, user_id)")
    .eq("outcome", "pending")
    .lte("due_at", new Date().toISOString())
    .eq("ideas.user_id", userId)
    .order("due_at", { ascending: true });

  const due = (duePreds ?? []).map((p) => ({
    id: p.id as string,
    text: p.text as string,
    ideaId: p.idea_id as string,
  }));

  return (
    <AppShell>
      <main className="animate-fade-up mx-auto max-w-4xl px-4 py-10 sm:px-6">
        {(weeklyDue || monthlyDue || dueRetroPredictions.length > 0) && (
          <section className="mb-8">
            <div className="flex items-center gap-2">
              <RotateCcw className="size-4 text-orange-600" />
              <h2 className="text-sm font-medium">复盘反馈到期</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              恢复当时判断，再看现实。不要让结果替你重写记忆。
            </p>
            <Link
              href="/retrospectives"
              className="mt-3 flex items-center gap-3 rounded-lg border border-orange-300 bg-orange-50 p-4 text-sm text-orange-950 transition-colors hover:bg-orange-100"
            >
              <span className="min-w-0 flex-1">
                {[
                  weeklyDue ? "周复盘" : null,
                  monthlyDue ? "月复盘" : null,
                  dueRetroPredictions.length
                    ? `${dueRetroPredictions.length} 条预测待对账`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <span className="shrink-0 text-xs">去复盘 →</span>
            </Link>
          </section>
        )}

        {dueRealityCases.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center gap-2">
              <ScanSearch className="size-4 text-orange-600" />
              <h2 className="text-sm font-medium">现状需要复查</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              当时选择的路径已经到复查日。先记录现实发生了什么，再更新地图。
            </p>
            <ul className="mt-3 space-y-2">
              {dueRealityCases.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/reality/${item.id}`}
                    className="flex items-center gap-3 rounded-lg border border-orange-300 bg-orange-50 p-4 text-sm text-orange-950 transition-colors hover:bg-orange-100"
                  >
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    <span className="shrink-0 text-xs">更新现状 →</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {due.length > 0 && (
          <section className="mb-8">
            <h2 className="text-sm font-medium">该对账了</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              这些预测到期了。去标记命中还是没命中——别让大脑事后篡改记忆。
            </p>
            <ul className="mt-3 space-y-2">
              {due.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/ideas/${p.ideaId}`}
                    className="flex items-center gap-3 rounded-lg border border-orange-300 bg-orange-50 p-4 text-sm text-orange-900 transition-colors hover:bg-orange-100"
                  >
                    <span className="min-w-0 flex-1">{p.text}</span>
                    <span className="shrink-0 text-xs">去对账 →</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {hasSystemData && (
          <div className="mb-8 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Link
              href="/reasoning"
              className="group rounded-lg border bg-card p-3 hover:bg-muted/60 transition-colors"
            >
              <p className="text-[10px] text-muted-foreground">推理工具</p>
              <p className="mt-1 text-sm font-medium">
                {beliefCount > 0 ? `${beliefCount} 条信念` : "暂无记录"}
              </p>
            </Link>
            <Link
              href="/reality"
              className="group rounded-lg border bg-card p-3 hover:bg-muted/60 transition-colors"
            >
              <p className="text-[10px] text-muted-foreground">现状认识</p>
              <p className="mt-1 text-sm font-medium">
                {realityCases.length > 0
                  ? `${realityCases.length} 个案例`
                  : "暂无记录"}
              </p>
              {dueRealityCases.length > 0 && (
                <p className="mt-0.5 text-[10px] text-orange-600">
                  {dueRealityCases.length} 个待复查
                </p>
              )}
            </Link>
            <Link
              href="/customer-view"
              className="group rounded-lg border bg-card p-3 hover:bg-muted/60 transition-colors"
            >
              <p className="text-[10px] text-muted-foreground">顾客视点</p>
              <p className="mt-1 text-sm font-medium">
                {customerCount > 0 ? `${customerCount} 个研究` : "暂无记录"}
              </p>
            </Link>
            <Link
              href="/retrospectives"
              className="group rounded-lg border bg-card p-3 hover:bg-muted/60 transition-colors"
            >
              <p className="text-[10px] text-muted-foreground">复盘系统</p>
              <p className="mt-1 text-sm font-medium">
                {lastRetroDate === null
                  ? "未开始"
                  : lastRetroDate === 0
                  ? "今天已复盘"
                  : `${lastRetroDate} 天前`}
              </p>
            </Link>
          </div>
        )}

        <header className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight">今天该接触谁</h1>
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
    </AppShell>
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
