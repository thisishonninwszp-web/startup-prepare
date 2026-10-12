import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { changeOver, fetchSlowSeries, SLOW_VARIABLES, type SlowPoint, type SlowSeries } from "@/lib/domains/signals/slow";

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

  const all = await Promise.all(SLOW_VARIABLES.map((v) => fetchSlowSeries(v)));

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

      <ul className="space-y-6">
        {all.map((s) => {
          const last = s.points[s.points.length - 1];
          const yearly = s.variable.source.type === "worldbank";
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

      <p className="mt-8 text-xs leading-6 text-muted-foreground">
        这张单子可以加：想盯别的数字（比如跨境电商规模、访日游客数），告诉 Claude 指标名，有公开数据源的就能加一行。
        有效求人倍率、实际工资在日本政府统计（e-Stat）里，要先注册一个免费的 appId。
      </p>
    </PageContainer>
  );
}
