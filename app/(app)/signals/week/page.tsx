import Link from "next/link";
import { UnderstandingReview } from "../events/understanding-review";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { tokyoToday } from "@/lib/domains/signals/brief";
import { getWeekly, lastWeekRange } from "@/lib/domains/signals/weekly";
import { WeeklyLoader } from "./weekly-loader";
import { sharedViewFor } from "@/lib/domains/signals/users";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function md(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(m)} 月 ${Number(d)} 日`;
}

function shiftWeek(start: string, weeks: number): string {
  const d = new Date(`${start}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

export default async function WeeklyPage({ searchParams }: { searchParams: { start?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const latest = lastWeekRange(tokyoToday()).start;
  const requested = searchParams.start && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.start) ? searchParams.start : latest;
  // 只看已经过完的周；周一要对齐
  const start = requested > latest || new Date(`${requested}T12:00:00Z`).getUTCDay() !== 1 ? latest : requested;
  const end = new Date(new Date(`${shiftWeek(start, 1)}T12:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10);
  // 朋友的账号看主账号那一份（周报只讲世界上发生了什么，不涉及他），不能自己写、不能重写
  const view = await sharedViewFor(user.id);
  const weekly = await getWeekly(view.sourceUserId, start);
  const prev = shiftWeek(start, -1);
  const next = start < latest ? shiftWeek(start, 1) : null;

  return (
    <PageContainer width="narrow">
      <PageHeader
        eyebrow="Weekly"
        title={`${md(start)} – ${md(end)} 这一周`}
        description="每天看的是碎片。这里把七天连起来：哪件事从周初响到周末，哪件只响了一天就没了下文。周复盘时会一起读进去。"
      />

      {weekly ? (
        <>
          <p className="text-[15px] leading-[1.75]">{weekly.summary}</p>
          {weekly.threads.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-3 text-base font-semibold">不止一天冒出来的事</h2>
              <ul className="space-y-4">
                {weekly.threads.map((t) => (
                  <li key={t.title} className="rounded-lg border border-border bg-card p-4">
                    <p className="font-medium">{t.title}</p>
                    <p className="mt-1 text-sm leading-7 text-muted-foreground">{t.note}</p>
                    <ul className="mt-2 space-y-1 text-sm">
                      {t.refs.map((r) => (
                        <li key={r.signal_id}>
                          <span className="mr-2 font-mono text-xs text-muted-foreground">{r.date.slice(5)}</span>
                          <Link href={`/signals/${r.signal_id}`} className="transition-colors duration-150 hover:text-primary">
                            {r.headline}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {!view.shared && (
            <div className="mt-8 flex justify-end">
              <WeeklyLoader weekStart={start} regenerate />
            </div>
          )}
        </>
      ) : view.shared ? (
        <p className="text-sm leading-7 text-muted-foreground">这一周的周报还没写。每周一早上会有。</p>
      ) : (
        <WeeklyLoader weekStart={start} />
      )}

      <UnderstandingReview viewerId={user.id} start={`${start}T00:00:00+09:00`} endExclusive={`${shiftWeek(start, 1)}T00:00:00+09:00`} />
      <nav className="mt-10 flex justify-between text-sm">
        <Link href={`/signals/week?start=${prev}`} className="text-muted-foreground transition-colors duration-150 hover:text-foreground">
          ← 再往前一周
        </Link>
        {next && (
          <Link href={`/signals/week?start=${next}`} className="text-muted-foreground transition-colors duration-150 hover:text-foreground">
            后一周 →
          </Link>
        )}
      </nav>
    </PageContainer>
  );
}
