import Link from "next/link";
import { actionSecret, LIST_TTL_DAYS, signAction } from "@/lib/action-links";
import { listSeconds, loadTodayList, previewLine } from "@/lib/domains/signals/today-list";
import { lastTouchNote, PAUSE_LABELS } from "@/lib/domains/signals/pause-shared";
import { ResumeButton } from "./resume-button";

/**
 * 「今天」页最上面（报头下）：今天要他点的几件 —— 和早上邮件那一框同一份清单、同一个取法，点开是一分钟清单那一页。
 * 两周没人点、先停了的那几样也写在这里，旁边一个「恢复」（他在网站上读报，邮件里的链接不点）。
 * 清单是空的、也没有停的就不出现；取不到也不出现（不拦着读报告）。
 */
export async function ListEntry({ userId, today }: { userId: string; today: string }) {
  const secret = actionSecret();
  const list = await loadTodayList(userId, today).catch((e) => {
    console.error("today: list", e);
    return null;
  });
  if (!list || (list.items.length === 0 && list.paused.length === 0)) return null;
  const href = secret ? `/a/${signAction({ u: userId, k: "list", t: today, v: "" }, secret, Date.now(), LIST_TTL_DAYS)}` : null;
  return (
    <section className="mb-6 rounded-lg border-l-4 border-primary bg-primary/5 px-4 py-3">
      {href && list.items.length > 0 && (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold">
              今天要你点的 {list.items.length} 件 · 大约 {listSeconds(list.items)} 秒
            </p>
            <Link href={href} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
              一分钟点完 →
            </Link>
          </div>
          <ul className="mt-1 space-y-0.5 text-xs leading-6 text-muted-foreground">
            {list.items.slice(0, 4).map((item, i) => {
              const l = previewLine(item);
              return (
                <li key={i} className="truncate">
                  {l.label}：{l.title}
                  {l.note ? ` · ${l.note}` : ""}
                </li>
              );
            })}
            {list.items.length > 4 && <li>还有 {list.items.length - 4} 件</li>}
          </ul>
        </>
      )}
      {list.paused.length > 0 && (
        <div className={href && list.items.length > 0 ? "mt-3 border-t border-border pt-2" : ""}>
          <p className="text-xs leading-6 text-muted-foreground">这几样两周多没人点，先停了：不再出新的，也不往清单里放。点过一次，第二天就照旧做。</p>
          <ul className="mt-1 space-y-1">
            {list.paused.map((s) => (
              <li key={s.kind} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="text-foreground">{PAUSE_LABELS[s.kind]}</span>
                <span className="text-muted-foreground">{lastTouchNote(s.lastTouch)}</span>
                <ResumeButton kind={s.kind} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
