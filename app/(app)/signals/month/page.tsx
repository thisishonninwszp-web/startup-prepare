import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { BarList } from "@/components/ui/bar-list";
import { tokyoToday } from "@/lib/domains/signals/brief";
import {
  ACTIVITY_LABELS,
  getMonthly,
  isMonth,
  monthlyActivity,
  monthWeeks,
  NEXT_LABELS,
  nextHref,
  shiftMonth,
  weekLabel,
} from "@/lib/domains/signals/monthly";
import { MonthlyLoader } from "./monthly-loader";
import { sharedViewFor } from "@/lib/domains/signals/users";
import { publicMonthlyLine } from "@/lib/domains/signals/shared-view";

export const dynamic = "force-dynamic";
// 缺的周报先补写再连起来，三四十秒，由这一页的 server action 跑
export const maxDuration = 60;

const monthName = (m: string) => `${Number(m.slice(0, 4))} 年 ${Number(m.slice(5, 7))} 月`;
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

export default async function MonthlyPage({ searchParams }: { searchParams: { m?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const today = tokyoToday();
  const current = today.slice(0, 7);
  const month = searchParams.m && isMonth(searchParams.m) && searchParams.m <= current ? searchParams.m : current;
  const ongoing = month === current;
  // 朋友的账号看主账号那一份月报（去掉跟主账号的差距清单、想法的关联和下一步）；「往前推了几格」数的是自己的
  const view = await sharedViewFor(user.id);
  const [ownMonthly, activity] = await Promise.all([getMonthly(view.sourceUserId, month).catch(() => null), monthlyActivity(user.id, month)]);
  const monthly = ownMonthly && view.shared ? { ...ownMonthly, lines: ownMonthly.lines.map(publicMonthlyLine) } : ownMonthly;
  const weeks = monthly?.weeks.length ? monthly.weeks : monthWeeks(month, today);
  const prev = shiftMonth(month, -1);
  const next = month < current ? shiftMonth(month, 1) : null;

  return (
    <PageContainer width="narrow">
      <PageHeader
        eyebrow="Monthly"
        title={`${monthName(month)}${ongoing ? "（到今天为止）" : ""}`}
        description="一周一周看，看不出一个月的走势。这里把这个月的几份周报连起来：哪几条线整个月都在走、哪几条中途没声了，再落到你的差距清单和想法上 —— 每条给一步该做的。读完就去做那一步。"
      />

      <section className="mb-10">
        <BarList
          title="这个月往前推了几格（只数次数）"
          items={ACTIVITY_LABELS.filter((a) => activity[a.key] !== null).map((a) => ({ label: a.label, value: activity[a.key] as number }))}
          unit=" 次"
          empty="这个月一格都还没动：判断、听一听、假门、周刊、真实对话都是 0。外部信号读得再多，不往前推一格就只是在读。"
        />
      </section>

      {monthly ? (
        <>
          <p className="text-[15px] leading-[1.75]">{monthly.summary}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            连起来的是 {monthly.weeks.map((w, i) => weekLabel(i, w)).join("、")} 的周报
            {ongoing ? "；这周还没过完的不算，月底前可以重写" : ""}。
          </p>
          {monthly.lines.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-3 text-base font-semibold">不止一周出现的线</h2>
              <ul className="space-y-4">
                {monthly.lines.map((l) => (
                  <li key={l.title} className="rounded-lg border border-border bg-card p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-medium">{l.title}</p>
                      <span className="font-mono text-xs text-muted-foreground">
                        {l.status === "still" ? "到最后一周还在走" : "后来没声了"} · 出现在 {l.weeks.length} 周
                      </span>
                    </div>
                    <p className="mt-1 text-sm leading-7 text-muted-foreground">{l.note}</p>
                    <ul className="mt-2 space-y-1 text-sm">
                      {l.threads.map((t) => (
                        <li key={`${t.weekStart}-${t.title}`}>
                          <Link
                            href={`/signals/week?start=${t.weekStart}`}
                            className="mr-2 font-mono text-xs text-muted-foreground transition-colors duration-150 hover:text-primary"
                          >
                            {md(t.weekStart)} 那周
                          </Link>
                          {t.title}
                        </li>
                      ))}
                    </ul>
                    {l.related.length > 0 && (
                      <p className="mt-2 text-sm leading-7">
                        <span className="text-muted-foreground">跟你手上的：</span>
                        {l.related.map((r, i) => (
                          <span key={`${r.kind}-${r.id}`}>
                            {i > 0 ? "、" : ""}
                            <Link
                              href={r.kind === "idea" ? `/ideas/${r.id}` : "/signals/gaps"}
                              className="text-primary underline-offset-4 hover:underline"
                            >
                              {r.kind === "idea" ? "想法" : "差距"}「{r.title}」
                            </Link>
                          </span>
                        ))}
                      </p>
                    )}
                    {l.next && (
                      <p className="mt-2 text-sm leading-7">
                        <Link href={nextHref(l.next, l.related)} className="font-medium text-primary underline-offset-4 hover:underline">
                          下一步：{NEXT_LABELS[l.next]} →
                        </Link>
                        <span className="ml-1 text-muted-foreground">{l.why}</span>
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {monthly.lines.length === 0 && (
            <p className="mt-6 text-sm leading-7 text-muted-foreground">这个月没有哪条线连着出现两周以上 —— 都是一周就过去的事。</p>
          )}
          {!view.shared && (
            <div className="mt-8 flex justify-end">
              <MonthlyLoader month={month} regenerate />
            </div>
          )}
        </>
      ) : weeks.length < 2 ? (
        <p className="text-sm leading-7 text-muted-foreground">
          这个月过完的周还不到两周{weeks.length === 1 ? `（只有 ${weekLabel(0, weeks[0])}）` : ""}，连不起来。
          {ongoing ? "过了下个周日再来；这期间看「周报」就够了。" : "看看前后的月份。"}
        </p>
      ) : view.shared ? (
        <p className="text-sm leading-7 text-muted-foreground">这个月的月报还没写。</p>
      ) : (
        <MonthlyLoader month={month} />
      )}

      <nav className="mt-10 flex justify-between text-sm">
        <Link href={`/signals/month?m=${prev}`} className="text-muted-foreground transition-colors duration-150 hover:text-foreground">
          ← {monthName(prev)}
        </Link>
        {next && (
          <Link href={`/signals/month?m=${next}`} className="text-muted-foreground transition-colors duration-150 hover:text-foreground">
            {monthName(next)} →
          </Link>
        )}
      </nav>
    </PageContainer>
  );
}
