import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Clock3,
  Scale,
  Settings,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { RetroNav } from "./retro-nav";
import {
  getDailyReflection,
  getReflectionSettings,
  listDailyReflections,
  listDueRetroPredictions,
  listJudgmentRules,
  listOpenRetroCommitments,
  listRetroPeriods,
  todayInTimezone,
} from "./queries";
import { getMonthlyPeriod, getWeeklyPeriod } from "./types";
import { RetroHomeActions } from "./retro-home-actions";

export const dynamic = "force-dynamic";

export default async function RetrospectivesPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user!.id;
  const settings = await getReflectionSettings(userId);
  const today = todayInTimezone(settings.timezone);
  const week = getWeeklyPeriod(today, settings.review_weekday);
  const month = getMonthlyPeriod(today);
  const [
    todayReflection,
    recentDays,
    periods,
    rules,
    duePredictions,
    openCommitments,
  ] = await Promise.all([
    getDailyReflection(userId, today),
    listDailyReflections(userId, week.start, week.end),
    listRetroPeriods(userId),
    listJudgmentRules(userId),
    listDueRetroPredictions(userId),
    listOpenRetroCommitments(userId),
  ]);
  const weeklyPeriod = periods.find(
    (item) =>
      item.period_type === "weekly" &&
      item.period_start === week.start &&
      item.period_end === week.end
  );
  const monthlyPeriod = periods.find(
    (item) =>
      item.period_type === "monthly" &&
      item.period_start === month.start &&
      item.period_end === month.end
  );
  const activeRules = rules.filter((rule) => rule.status === "active");

  const categoryMinutes = new Map<string, number>();
  for (const day of recentDays) {
    if (day.status !== "confirmed") continue;
    for (const block of day.daily_time_blocks ?? []) {
      const minutes = (block.end_slot - block.start_slot) * 30;
      categoryMinutes.set(
        block.category_key,
        (categoryMinutes.get(block.category_key) ?? 0) + minutes
      );
    }
  }

  return (
    <>
      <RetroNav />
      <main className="min-h-screen bg-[#f7f7f5]">
        <section className="border-b bg-background px-4 py-10 sm:px-8 lg:px-12">
          <div className="mx-auto flex max-w-6xl flex-col gap-8 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                Evidence before narrative
              </p>
              <h1 className="mt-4 max-w-3xl text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
                别总结得漂亮。先恢复当时的判断。
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
                每日看见时间去了哪里，每周对账判断与现实，每月修正规则。
              </p>
            </div>
            <Link
              href="/retrospectives/settings"
              className="inline-flex h-10 items-center gap-2 rounded-md border bg-card px-4 text-sm"
            >
              <Settings className="size-4" />
              复盘协议
            </Link>
          </div>
        </section>

        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 lg:px-12">
          {duePredictions.length > 0 && (
            <section className="mb-8 rounded-xl border border-orange-300 bg-orange-50 p-5">
              <h2 className="text-sm font-medium text-orange-950">
                周复盘预测到期
              </h2>
              <p className="mt-1 text-xs text-orange-900/70">
                不解释过去，先标记命中还是没命中。
              </p>
              <RetroHomeActions duePredictions={duePredictions} />
            </section>
          )}

          {openCommitments.length > 0 && (
            <section className="mb-8 rounded-xl border bg-card p-5">
              <h2 className="text-sm font-medium">上次复盘留下的现实行动</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                完成之后再记录，不用提前证明自己会做到。
              </p>
              <RetroHomeActions openCommitments={openCommitments} />
            </section>
          )}

          <div className="grid gap-4 lg:grid-cols-[1.25fr_.75fr]">
            <Link
              href={`/retrospectives/daily/${today}`}
              className="group relative overflow-hidden rounded-xl border bg-foreground p-6 text-background"
            >
              <div className="absolute right-0 top-0 font-mono text-[7rem] leading-none opacity-[0.05]">
                24
              </div>
              <div className="flex items-center gap-2 text-xs opacity-60">
                <Clock3 className="size-4" />
                TODAY · {today}
              </div>
              <h2 className="mt-8 text-2xl font-medium tracking-tight">
                {todayReflection?.status === "confirmed"
                  ? todayReflection.fact_observation
                  : "今天实际交给了什么？"}
              </h2>
              <div className="mt-6 inline-flex items-center gap-2 text-sm">
                {todayReflection ? "查看时间镜子" : "写下今天"}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </div>
            </Link>

            <section className="rounded-xl border bg-card p-5">
              <div className="flex items-center gap-2">
                <Scale className="size-4" />
                <h2 className="text-sm font-medium">本周已确认时间</h2>
              </div>
              <div className="mt-5 space-y-3">
                {settings.categories
                  .map((category) => ({
                    ...category,
                    minutes: categoryMinutes.get(category.key) ?? 0,
                  }))
                  .filter((category) => category.minutes > 0)
                  .map((category) => (
                    <div
                      key={category.key}
                      className="flex items-baseline justify-between border-b pb-2 text-sm last:border-0"
                    >
                      <span>{category.label}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {Math.floor(category.minutes / 60)}h{" "}
                        {category.minutes % 60}m
                      </span>
                    </div>
                  ))}
                {categoryMinutes.size === 0 && (
                  <p className="text-xs text-muted-foreground">
                    确认每日时间镜子后，这里只显示绝对时长，不计算效率。
                  </p>
                )}
              </div>
            </section>
          </div>

          <section className="mt-10">
            <div className="flex items-center gap-2">
              <CalendarDays className="size-4" />
              <h2 className="text-sm font-medium">周期对账</h2>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <PeriodCard
                eyebrow="Weekly"
                title={`${week.start}—${week.end}`}
                description={`${recentDays.filter((day) => day.status === "confirmed").length} 天有确认时间镜子`}
                period={weeklyPeriod}
                type="weekly"
                start={week.start}
                end={week.end}
              />
              <PeriodCard
                eyebrow="Monthly"
                title={month.start.slice(0, 7)}
                description="只汇总已完成周复盘，并保留反例"
                period={monthlyPeriod}
                type="monthly"
                start={month.start}
                end={month.end}
              />
            </div>
          </section>

          <section className="mt-10">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-medium">当前判断规则</h2>
              <span className="font-mono text-[10px] text-muted-foreground">
                {activeRules.length} ACTIVE
              </span>
            </div>
            {activeRules.length ? (
              <div className="mt-4 divide-y border-y">
                {activeRules.map((rule, index) => (
                  <div
                    key={rule.id}
                    className="grid grid-cols-[2rem_1fr] gap-3 py-4 text-sm"
                  >
                    <span className="font-mono text-xs text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span>{rule.text}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                完成第一份周复盘后，这里会出现一条可被现实修正的判断规则。
              </p>
            )}
          </section>
        </div>
      </main>
    </>
  );
}

function PeriodCard({
  eyebrow,
  title,
  description,
  period,
  type,
  start,
  end,
}: {
  eyebrow: string;
  title: string;
  description: string;
  period:
    | {
        id: string;
        status: string;
      }
    | undefined;
  type: "weekly" | "monthly";
  start: string;
  end: string;
}) {
  return (
    <article className="rounded-xl border bg-card p-5">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {eyebrow}
      </div>
      <h3 className="mt-2 text-lg font-medium">{title}</h3>
      <p className="mt-2 text-xs text-muted-foreground">{description}</p>
      <RetroHomeActions
        period={period}
        type={type}
        start={start}
        end={end}
      />
    </article>
  );
}
