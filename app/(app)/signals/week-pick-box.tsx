import Link from "next/link";
import { loadWeekPick } from "@/lib/domains/signals/week-pick";
import type { WeekPickState } from "@/lib/domains/signals/week-pick";
import { WeekPickButton } from "./week-pick-button";

/**
 * 「今天」页周日那一框：这周的一件（差距清单里根据最多的一条），点一下变成想法。和周末版邮件最上面同一份。
 * 朋友的账号、清单是空的、取不到就不出现（不拦着读报告）。
 */
export async function WeekPickBox({ userId, today, monday }: { userId: string; today: string; monday: string }) {
  const state = await loadWeekPick(userId, today, monday).catch((e) => {
    console.error("today: week pick", e);
    return null;
  });
  return state ? <WeekPickView state={state} /> : null;
}

export function WeekPickView({ state }: { state: WeekPickState }) {
  if (state.kind === "done") {
    return (
      <section className="mb-6 rounded-lg border border-border px-4 py-3 text-sm leading-7">
        这周的一件已经变成想法了：
        <Link href={`/ideas/${state.idea.id}`} className="text-primary underline-offset-4 hover:underline">
          {state.idea.title}
        </Link>
        。下一步在「最小实验」那一格：这周先去问人。
      </section>
    );
  }
  const w = state.pick;
  return (
    <section className="mb-6 rounded-lg border border-primary/40 bg-card px-4 py-4">
      <p className="text-xs font-medium text-primary">这周的一件 · 可以变成想法</p>
      <h2 className="mt-1 text-base font-semibold leading-7">{w.headline}</h2>
      {w.why && <p className="text-xs leading-6 text-muted-foreground">{w.why}</p>}
      <dl className="mt-3 space-y-2 text-sm leading-7">
        <div>
          <dt className="text-xs text-muted-foreground">最关键的假设（错了就做不成）</dt>
          <dd>{w.riskiest}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">先去问谁</dt>
          <dd>
            {w.who.length === 0 ? (
              w.test
            ) : (
              <ul className="space-y-1">
                {w.who.map((x) => (
                  <li key={x.who}>
                    <span className="font-medium">{x.who}</span>：{x.how}
                    {x.quote && (
                      <a
                        href={x.quote.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block text-xs text-muted-foreground underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline"
                      >
                        「{x.quote.excerpt}」
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-xs leading-6 text-muted-foreground">{w.evidence}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <WeekPickButton side={w.side} signalId={w.signal_id} />
        <Link href={`/signals/gaps/deep?side=${w.side}&id=${w.signal_id}`} className="text-sm text-primary underline-offset-4 hover:underline">
          先看这一条的全部材料 →
        </Link>
      </div>
    </section>
  );
}
