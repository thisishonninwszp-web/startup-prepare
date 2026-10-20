import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import type { BriefItem } from "@/lib/domains/signals/brief";
import { pestleCoverage } from "@/lib/domains/signals/coverage";
import { describeMove, fetchFastMoves, isUnusual } from "@/lib/domains/signals/fast";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import {
  changeOver,
  fetchSlowSeries,
  isMonthly,
  SLOW_VARIABLES,
  type SlowPoint,
  type SlowSeries,
} from "@/lib/domains/signals/slow";
import { loadSlowThens, loadSlowWind } from "@/lib/domains/signals/slow-then";
import { SlowThenView } from "./slow-then-view";
import { WindButton } from "./wind-button";
import { WindList } from "./wind-line";

export const dynamic = "force-dynamic";
// 世界银行的接口一次要十秒上下；取到的数据缓存一天
export const maxDuration = 60;

/** 一条小折线：只看方向和形状，不标刻度。 */
function Sparkline({ points }: { points: SlowPoint[] }) {
  if (points.length < 2) return null;
  const w = 240;
  const h = 48;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${((i / (points.length - 1)) * w).toFixed(1)},${(h - ((p.value - min) / span) * h).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-12 w-60 text-primary" aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function fmt(v: number, digits: number): string {
  return v.toLocaleString("ja-JP", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function Change({ series, back, label }: { series: SlowSeries; back: number; label: string }) {
  const c = changeOver(series.points, back);
  if (!c) return null;
  const { digits, unit } = series.variable;
  // 四舍五入后是 0 的（"-0.0"），直接说几乎没变
  if (Number(c.delta.toFixed(digits)) === 0) {
    return (
      <span>
        {label}（{c.from.date.slice(0, 7)}）几乎没变
      </span>
    );
  }
  const sign = c.delta > 0 ? "+" : "";
  return (
    <span>
      {label}（{c.from.date.slice(0, 7)}）{sign}
      {fmt(c.delta, digits)}
      {unit === "%" ? " 个百分点" : ` ${unit}`}
    </span>
  );
}

export default async function SlowVariablesPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const [all, week, fast, thens, wind] = await Promise.all([
    Promise.all(SLOW_VARIABLES.map((v) => fetchSlowSeries(v))),
    supabaseAdmin.from("signal_briefs").select("items").eq("user_id", user.id).gte("brief_date", weekAgo),
    fetchFastMoves(),
    loadSlowThens(user.id),
    loadSlowWind(user.id),
  ]);
  const coverage = pestleCoverage((week.data ?? []).flatMap((r) => (r.items as BriefItem[] | null) ?? []));
  const tagged = coverage.reduce((n, c) => n + c.count, 0);

  return (
    <PageContainer width="narrow">
      <p className="mb-4 text-sm">
        <Link href="/signals" className="text-muted-foreground transition-colors duration-150 hover:text-foreground">
          ← 今日报告
        </Link>
      </p>
      <PageHeader
        eyebrow="Slow variables"
        title="慢变量"
        description="每天几乎不动、从不上头条，但决定未来十年的几个数字。每天新闻里的倒产潮、外国司机、自助收银机，常常是同一个慢变量的不同表面。一周看一次就够。"
      />

      <section className="mb-8 rounded-lg border border-border bg-card p-4 text-sm leading-7">
        <h2 className="text-base font-semibold">这些数字有什么用</h2>
        <p className="mt-1 text-muted-foreground">
          慢变量自己不会让你做任何事，它是你做三类决定时的底：挑方向时看顺风还是逆风；看时机时问「为什么是现在、五年前为什么不行」；
          押「两年内会不会出现」时多一个理由或反理由。点下面这个，看看你差距清单和想法库里的东西，各顺着、逆着哪几个数字。
        </p>
        <div className="mt-3">
          <WindButton lastAt={wind?.created_at ?? null} />
        </div>
      </section>

      <ul className="space-y-6">
        {all.map((s) => {
          const last = s.points[s.points.length - 1];
          const yearly = !isMonthly(s);
          return (
            <li key={s.variable.key} className="rounded-lg border border-border bg-card p-4">
              <h2 className="text-base font-semibold">{s.variable.label}</h2>
              {last ? (
                <>
                  <p className="mt-1 font-mono text-2xl">
                    {fmt(last.value, s.variable.digits)}
                    <span className="ml-1 text-sm text-muted-foreground">
                      {s.variable.unit} · {yearly ? `${last.date} 年` : last.date}
                    </span>
                  </p>
                  <Sparkline points={s.points} />
                  <p className="flex flex-wrap gap-x-4 font-mono text-xs text-muted-foreground">
                    <Change series={s} back={yearly ? 1 : 12} label="比一年前" />
                    <Change series={s} back={yearly ? 10 : 59} label={yearly ? "比十年前" : "比五年前"} />
                  </p>
                </>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">这次没取到数据，晚点再来看。</p>
              )}
              <p className="mt-2 text-sm leading-7">{s.variable.why}</p>
              {wind && <WindList links={wind.links.filter((l) => l.key === s.variable.key)} />}
              {last && <SlowThenView variableKey={s.variable.key} initial={thens[s.variable.key] ?? null} />}
              <a
                href={s.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline"
              >
                数据：{s.sourceLabel} ↗
              </a>
            </li>
          );
        })}
      </ul>

      <section className="mt-10 border-t pt-6">
        <h2 className="text-base font-semibold">快变量</h2>
        <p className="mt-1 text-xs leading-6 text-muted-foreground">
          每天都在动的几个数。平时不用看；哪一项一周动得近两年里少见，报告最上面和邮件里会提一句。只说动得大不大，不说接下来往哪走。
        </p>
        {fast.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">这次没取到数据，晚点再来看。</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm leading-7">
            {fast.map((m) => (
              <li key={m.variable.key} className={isUnusual(m) ? "text-primary" : ""}>
                {describeMove(m)}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted-foreground">数据：Yahoo Finance 周线</p>
      </section>

      <section className="mt-10 border-t pt-6">
        <h2 className="text-base font-semibold">这一周的报告看了哪些领域</h2>
        <p className="mt-1 text-xs leading-6 text-muted-foreground">
          政治、经济、社会、技术、法律、环境各出现了几条。一直是零的那个，就是你长期没在看的地方。
        </p>
        {tagged === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">这一周的报告还没标领域（新功能，之后的报告会标）。</p>
        ) : (
          <ul className="mt-3 space-y-1 font-mono text-sm">
            {coverage.map((c) => (
              <li key={c.domain} className={c.count === 0 ? "text-primary" : ""}>
                {c.label}：{c.count}
                {c.count === 0 ? " · 这一周一条都没有" : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-8 text-xs leading-6 text-muted-foreground">
        这张单子可以加：想盯别的数字（比如跨境电商规模、访日游客数），告诉 Claude 指标名，有公开数据源的就能加一行。
        有效求人倍率和实际工资暂时加不了：前者在 e-Stat 的接口里查不到，后者在接口上停在 2021 年，只能去厚生劳动省的网站看。
      </p>
    </PageContainer>
  );
}
