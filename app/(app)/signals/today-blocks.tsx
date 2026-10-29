import Link from "next/link";
import { newsSourceLabel } from "@/lib/domains/signals/feeds";
import { KIND_LABELS, pct } from "@/lib/domains/signals/forecast-shared";
import { DAILY_DRILL } from "@/lib/domains/signals/history-shared";
import { followReasonText, type StoryUpdate } from "@/lib/domains/signals/memory-shared";
import { RecallCard } from "./recall-card";
import { FOLLOW_DAYS } from "@/lib/domains/signals/memory";
import { loadTodayPersonal, type TodayForecast, type TodayPersonal } from "@/lib/domains/signals/today";
import { eventsEnabled } from "./events/enabled";
import { eventLinksForSignals } from "@/lib/domains/signals/events/queries";

type EventLinks = Record<string, { id: string; title: string }[]>;

/** 「今天」一页最多列几件在跟的事（多的去记忆页看）。 */
const STORIES_SHOWN = 5;

const linkClass = "transition-colors duration-150 hover:text-primary";

/**
 * 「今天」一页里因人而异的三块：你在跟的事有没有新消息、回头看一条、预测题里等你做的。
 * 放在 Suspense 里：报告先出来，这几块算好了再补上。
 */
export async function TodayBlocks({ userId, today }: { userId: string; today: string }) {
  const t = await loadTodayPersonal(userId, today);
  const eventLinks = eventsEnabled() && Array.isArray(t.stories) ? await eventLinksForSignals(userId, t.stories.map((story) => story.followed.signal_id)) : {};
  return <TodayBlocksView t={t} eventLinks={eventLinks} />;
}

export function TodayBlocksView({ t, eventLinks = {} }: { t: TodayPersonal; eventLinks?: EventLinks }) {
  return (
    <>
      <Stories t={t} eventLinks={eventLinks} />
      {t.recall && t.recall.items.length > 0 && <Recall recall={t.recall} />}
      {t.forecast && <ForecastTodo f={t.forecast} />}
    </>
  );
}

function Stories({ t, eventLinks }: { t: TodayPersonal; eventLinks: EventLinks }) {
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
          <StoryList stories={stories.slice(0, STORIES_SHOWN)} eventLinks={eventLinks} />
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
export function StoryList({ stories, eventLinks = {} }: { stories: StoryUpdate[]; eventLinks?: EventLinks }) {
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
          {(eventLinks[s.followed.signal_id] ?? []).map((event) => <p key={event.id} className="mt-1 text-xs"><Link href={`/signals/events/${event.id}`} className="text-primary hover:underline">{event.title} · 事件时间线 →</Link></p>)}
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

function Recall({ recall }: { recall: NonNullable<TodayPersonal["recall"]> }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold">回想</h2>
      <p className="mt-1 text-xs leading-6 text-muted-foreground">自己想起来一次，比再看一遍记得牢。先想，再看答案；记得的会隔得越来越久再问。</p>
      <div className="mt-3 space-y-3">
        {recall.items.map((item) => (
          <RecallCard key={item.signal_id} item={item} />
        ))}
      </div>
      {recall.total > recall.items.length && (
        <p className="mt-2 text-xs text-muted-foreground">
          今天一共有 {recall.total} 条到期，
          <Link href="/signals/memory#recall" className="underline-offset-4 hover:underline">
            其余的在记忆页
          </Link>
          。
        </p>
      )}
    </section>
  );
}

function outcomeText(q: TodayForecast["justResolved"][number]["q"]): string {
  if (q.status === "void") return "作废了";
  return q.outcome ? "发生了" : "没发生";
}

function ForecastTodo({ f }: { f: TodayForecast }) {
  const drillLeft = f.drill && f.drill.left > 0 && f.drill.today < DAILY_DRILL ? DAILY_DRILL - f.drill.today : 0;
  const exp = f.experiments;
  const expCount = exp ? exp.proposals + exp.waiting : 0;
  if (f.toForecast.length === 0 && f.toConfirm === 0 && f.justResolved.length === 0 && drillLeft === 0 && expCount === 0) return null;
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold">预测</h2>
      {drillLeft > 0 && (
        <p className="mt-1 text-sm leading-7">
          <Link href="/signals/calibrate" className="font-medium text-primary underline-offset-4 hover:underline">
            校准练习还差 {drillLeft} 道
          </Link>
          <span className="ml-2 text-xs text-muted-foreground">已经结算的历史题，点了马上揭晓，两分钟</span>
        </p>
      )}
      {exp && expCount > 0 && (
        <p className="mt-1 text-sm leading-7">
          <Link href="/signals/forecast#experiments" className="font-medium text-primary underline-offset-4 hover:underline">
            {exp.proposals > 0 ? `你的实验有 ${exp.proposals} 道可以先猜` : `你的实验有 ${exp.waiting} 道到期了，等你填数对账`}
          </Link>
          <span className="ml-2 text-xs text-muted-foreground">假门、周刊的结果，先猜再看</span>
        </p>
      )}
      {f.toForecast.length > 0 && (
        <>
          <p className="mt-1 text-sm leading-7">
            <Link href="/signals/forecast" className="font-medium text-primary underline-offset-4 hover:underline">
              {f.toForecast.length} 道题等你判断
            </Link>
            <span className="ml-2 text-xs text-muted-foreground">AI 先判好了，你点行不行</span>
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
