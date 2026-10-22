import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { appWatchSummary } from "@/lib/domains/signals/app-watch";
import { japanEntryNews } from "@/lib/domains/signals/indicators";
import { newsSourceLabel } from "@/lib/domains/signals/feeds";
import { loadForecastBoard } from "@/lib/domains/signals/forecast";

export const dynamic = "force-dynamic";

const linkClass = "transition-colors duration-150 hover:text-primary";

/**
 * 领先指标（迁移 096）：中国公司要进日本，几个月前就会留下痕迹 —— 在日本 App Store 上架、加日语、宣布进日本。
 * 看行为，不看说法；和「到日本题」放在一起，猜的时候有东西可看。
 */
export default async function IndicatorsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const [apps, entries, board] = await Promise.all([
    appWatchSummary().catch((e) => {
      console.error("indicators: apps", e);
      return null;
    }),
    japanEntryNews(30).catch((e) => {
      console.error("indicators: entries", e);
      return [];
    }),
    loadForecastBoard(user.id).catch(() => "missing-schema" as const),
  ]);
  const arrivals = board === "missing-schema" ? [] : board.questions.filter((q) => q.kind === "arrival" && q.status === "open");

  return (
    <PageContainer width="narrow">
      <PageHeader
        eyebrow="Leading indicators"
        title="领先指标"
        description="中国、美国的东西要来日本，几个月前就会留下痕迹：在日本 App Store 上架、加日语、宣布进日本、在日本设公司。看他们做了什么，不看谁说了什么。"
      />

      <section className="mb-10">
        <h2 className="mb-1 text-base font-semibold">上过中国 App 榜的 App</h2>
        {apps === null ? (
          <p className="text-sm leading-7 text-muted-foreground">还差一步：迁移 096 没跑。执行 supabase/migrations/096_signal_indicators.sql 之后，后台每天早晚各查一次。</p>
        ) : apps.total === 0 ? (
          <p className="text-sm leading-7 text-muted-foreground">还没查过：后台每天早上 7:30 和晚上 7 点查一次（第一次只记下现状，之后从没有变成有才算一件事）。</p>
        ) : (
          <>
            <p className="text-sm leading-7">
              看着 <span className="font-mono">{apps.total}</span> 个上过中国免费榜的 App：<span className="font-mono">{apps.inJp}</span> 个日本 App Store 上有，
              <span className="font-mono">{apps.withJa}</span> 个支持日语。
            </p>
            {apps.recent.length === 0 ? (
              <p className="mt-1 text-xs leading-6 text-muted-foreground">最近 90 天没有新上架日本、新加日语的。</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {apps.recent.map((a) => (
                  <li key={a.app_id} className="text-sm leading-7">
                    {a.url ? (
                      <a href={a.url} target="_blank" rel="noreferrer" className={`font-medium ${linkClass}`}>
                        {a.name}
                      </a>
                    ) : (
                      <span className="font-medium">{a.name}</span>
                    )}
                    {a.developer && <span className="ml-1 text-xs text-muted-foreground">{a.developer}</span>}
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      {[a.jp_since && `${a.jp_since} 在日本上架`, a.ja_since && `${a.ja_since} 加了日语`].filter(Boolean).join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs leading-6 text-muted-foreground">在日本上架不等于在日本做推广；加日语更说明在准备。每件新的变化也记成一条新闻，进存档、进「今天」。</p>
          </>
        )}
      </section>

      <section className="mb-10">
        <h2 className="mb-1 text-base font-semibold">最近 30 天说要进日本的</h2>
        {entries.length === 0 ? (
          <p className="text-sm leading-7 text-muted-foreground">存档里最近 30 天没有标题里说「进日本 / 日本上陸 / 日本法人」这类的新闻。</p>
        ) : (
          <ul className="space-y-1">
            {entries.map((e) => (
              <li key={e.id} className="text-sm leading-7">
                <span className="mr-2 font-mono text-xs text-muted-foreground">{e.fetched_at.slice(5, 10)}</span>
                <Link href={`/signals/${e.id}`} className={linkClass}>
                  {e.title}
                </Link>
                <span className="ml-1 text-xs text-muted-foreground">{newsSourceLabel(e.source)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-base font-semibold">到日本题</h2>
        <p className="mb-2 text-xs leading-6 text-muted-foreground">
          差距清单里「那边有、日本还没有」的东西，到某天会不会在日本出现。每天从清单里出一道（开过假门的先出），附上时差图谱里同一类东西的历史当基准。
        </p>
        {arrivals.length === 0 ? (
          <p className="text-sm leading-7 text-muted-foreground">还没有。差距清单里有东西以后，后台每天早上出一道。</p>
        ) : (
          <ul className="space-y-3">
            {arrivals.map((q) => (
              <li key={q.id} className="text-sm leading-7">
                <p className="font-medium">{q.title}</p>
                {q.source.base && <p className="text-xs leading-6 text-muted-foreground">基准：{q.source.base}</p>}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-sm">
          <Link href="/signals/forecast" className="text-primary underline-offset-4 hover:underline">
            去预测页判断 →
          </Link>
        </p>
      </section>
    </PageContainer>
  );
}
