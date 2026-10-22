import Link from "next/link";
import { newsSourceLabel } from "@/lib/domains/signals/feeds";
import { KIND_LABELS, pct } from "@/lib/domains/signals/forecast-shared";
import { followReasonText, MARK_LABELS, RESURFACE_LABELS, type StoryUpdate } from "@/lib/domains/signals/memory-shared";
import { FOLLOW_DAYS } from "@/lib/domains/signals/memory";
import { loadTodayPersonal, type TodayForecast, type TodayPersonal } from "@/lib/domains/signals/today";

/** 「今天」一页最多列几件在跟的事（多的去记忆页看）。 */
const STORIES_SHOWN = 5;

const linkClass = "transition-colors duration-150 hover:text-primary";

/**
 * 「今天」一页里因人而异的三块：你在跟的事有没有新消息、回头看一条、预测题里等你做的。
 * 放在 Suspense 里：报告先出来，这几块算好了再补上。
 */
export async function TodayBlocks({ userId, today }: { userId: string; today: string }) {
  return <TodayBlocksView t={await loadTodayPersonal(userId, today)} />;
}

export function TodayBlocksView({ t }: { t: TodayPersonal }) {
  return (
    <>
      <Stories t={t} />
      {t.lookBack && <LookBack item={t.lookBack} />}
      {t.forecast && <ForecastTodo f={t.forecast} />}
    </>
  );
}

function Stories({ t }: { t: TodayPersonal }) {
  const { stories, followedCount } = t;
  const note = (text: string) => <p className="mt-1 text-sm leading-7 text-muted-foreground">{text}</p>;
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold">{Array.isArray(stories) && stories.length > 0 ? "你在跟的事，有新消息" : "你在跟的事"}</h2>
      {stories === null ? (
        note("还差一步：迁移 093 没跑。执行 supabase/migrations/093_signal_today.sql 之后，你标过、记成观察、写过判断的新闻，之后的消息会出现在这里。")
      ) : stories === "error" ? (
        note("这一块这次没取到，刷新一下再试。")
      ) : followedCount === 0 ? (
        note("你还没在跟什么。看新闻时点一下「重要 / 跟我有关 / 存疑」、记成观察或者写个判断，这件事之后的消息会出现在这里。")
      ) : stories.length === 0 ? (
        note(`你最近 ${FOLLOW_DAYS} 天在跟的 ${followedCount} 件事，这一天没有新消息。`)
      ) : (
        <>
          <p className="mt-1 text-xs leading-6 text-muted-foreground">最近 {FOLLOW_DAYS} 天你标过、记成观察、写过判断的新闻，这一天又抓到了说同一件事的。</p>
          <StoryList stories={stories.slice(0, STORIES_SHOWN)} />
          {stories.length > STORIES_SHOWN && (
            <p className="mt-3 text-xs text-muted-foreground">
              还有 {stories.length - STORIES_SHOWN} 件也有新消息，
              <Link href="/signals/memory" className="underline-offset-4 hover:underline">
                在记忆页
              </Link>
              。
            </p>
          )}
        </>
      )}
    </section>
  );
}

/** 一件在跟的事一组：当时那条（为什么在跟），底下是之后说同一件事的。记忆页也用。 */
export function StoryList({ stories }: { stories: StoryUpdate[] }) {
  return (
    <ul className="mt-3 space-y-5">
      {stories.map((s) => (
        <li key={s.followed.signal_id} className="text-sm leading-7">
          <p className="text-xs text-muted-foreground">
            {s.followed.fetched_at.slice(0, 10)} · {followReasonText(s.followed)}
            {s.followed.note ? `：${s.followed.note}` : ""}
          </p>
          <Link href={`/signals/${s.followed.signal_id}`} className={`font-medium ${linkClass}`}>
            {s.followed.title ?? "（没有标题）"}
          </Link>
          <ul className="mt-1 space-y-1 border-l border-border pl-3">
            {s.updates.map((u) => (
              <li key={u.id}>
                <span className="mr-2 font-mono text-xs text-muted-foreground">{u.fetched_at.slice(5, 10)}</span>
                <Link href={`/signals/${u.id}`} className={linkClass}>
                  {u.title ?? "（没有标题）"}
                </Link>
                <span className="ml-1 text-xs text-muted-foreground">{newsSourceLabel(u.source)}</span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function LookBack({ item: r }: { item: NonNullable<TodayPersonal["lookBack"]> }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold">回头看</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {RESURFACE_LABELS[r.daysAgo]}你标了「{MARK_LABELS[r.item.mark]}」{r.item.note ? `：${r.item.note}` : ""}
      </p>
      <Link href={`/signals/${r.item.signal_id}`} className={`text-sm font-medium leading-7 ${linkClass}`}>
        {r.item.title ?? "（没有标题）"}
      </Link>
      {r.later.length > 0 ? (
        <ul className="mt-1 space-y-1 border-l border-border pl-3 text-sm leading-7">
          {r.later.map((h) => (
            <li key={h.id}>
              <span className="mr-2 font-mono text-xs text-muted-foreground">{h.fetched_at.slice(0, 10)}</span>
              <Link href={`/signals/${h.id}`} className={linkClass}>
                {h.title}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">存档里还没有它后来的消息。当时你为什么在意它，现在还成立吗？</p>
      )}
    </section>
  );
}

function outcomeText(q: TodayForecast["justResolved"][number]["q"]): string {
  if (q.status === "void") return "作废了";
  return q.outcome ? "发生了" : "没发生";
}

function ForecastTodo({ f }: { f: TodayForecast }) {
  if (f.toForecast.length === 0 && f.toConfirm === 0 && f.justResolved.length === 0) return null;
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold">预测</h2>
      {f.toForecast.length > 0 && (
        <>
          <p className="mt-1 text-sm leading-7">
            <Link href="/signals/forecast" className="font-medium text-primary underline-offset-4 hover:underline">
              {f.toForecast.length} 道题等你判断
            </Link>
            <span className="ml-2 text-xs text-muted-foreground">先说你觉得几成，再看 AI 和市场</span>
          </p>
          <ul className="mt-1 space-y-1 text-sm leading-7">
            {f.toForecast.slice(0, 3).map((q) => (
              <li key={q.id}>
                <span className="mr-2 text-xs text-muted-foreground">
                  {KIND_LABELS[q.kind]} · {q.resolve_on} 截止
                </span>
                {q.title}
              </li>
            ))}
          </ul>
        </>
      )}
      {f.toConfirm > 0 && (
        <p className="mt-2 text-sm leading-7">
          <Link href="/signals/forecast" className="text-primary underline-offset-4 hover:underline">
            {f.toConfirm} 道生意题到期了，等你确认对账
          </Link>
        </p>
      )}
      {f.justResolved.length > 0 && (
        <>
          <p className="mt-3 text-xs text-muted-foreground">这几天对完账的</p>
          <ul className="mt-1 space-y-2 text-sm leading-7">
            {f.justResolved.map(({ q, me, ai, market }) => (
              <li key={q.id}>
                <span>{q.title}</span>
                <span className="ml-2 font-medium">{outcomeText(q)}</span>
                <span className="block font-mono text-xs text-muted-foreground">
                  你 {me !== null ? pct(me) : "没判断"} · AI {ai !== null ? pct(ai) : "—"}
                  {market !== null ? ` · 市场 ${pct(market)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
