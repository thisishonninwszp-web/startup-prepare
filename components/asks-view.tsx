import { BarList } from "@/components/ui/bar-list";
import { asksByYear, readTotals, type ChiebukuroSample, type KokkaiYears } from "@/lib/domains/signals/asks-shared";

const n = (v: number) => v.toLocaleString("ja-JP");

/**
 * 有多少人在问（程序自动查的三样）：知恵袋上的提问（按年份数、读过的那几页看过的人数和共感）、
 * 联想加假名问出来的说法、国会每年提到几次。undefined = 早先查的那次还没有这一样，不显示；null = 这次没取到。
 */
export function AsksView({
  topic,
  chiebukuro,
  asked,
  kokkai,
  thisYear,
}: {
  topic: string;
  chiebukuro?: ChiebukuroSample | null;
  asked?: string[] | null;
  kokkai?: KokkaiYears | null;
  thisYear: number;
}) {
  if (chiebukuro === undefined && asked === undefined && kokkai === undefined) return null;
  const totals = chiebukuro ? readTotals(chiebukuro.asks) : null;
  const read = chiebukuro ? chiebukuro.asks.filter((a) => a.views !== undefined).sort((a, b) => (b.views ?? 0) - (a.views ?? 0)) : [];
  return (
    <div className="space-y-4 text-xs leading-6">
      {chiebukuro !== undefined && (
        <div>
          <p className="text-sm font-medium">知恵袋上有多少人在问「{topic}」</p>
          {chiebukuro === null ? (
            <p className="text-muted-foreground">这次没取到（Google 没搜成，或者知恵袋没响应），过一会儿再查。</p>
          ) : chiebukuro.asks.length === 0 ? (
            <p className="text-muted-foreground">
              Google 找到 {chiebukuro.found} 页提问，读了 {chiebukuro.read} 页，标题里有「{topic}」的一个都没有 —— 换个普通人会怎么问的说法再试。
            </p>
          ) : (
            <>
              <p>
                Google 找到 <span className="font-mono">{chiebukuro.found}</span> 页提问、读了 <span className="font-mono">{chiebukuro.read}</span> 页，
                连同每页底下的相关提问，标题里有「{topic}」的一共 <span className="font-mono">{chiebukuro.asks.length}</span> 个。
                {totals && totals.pages > 0 && (
                  <>
                    读过的 {totals.pages} 页一共被看了 <span className="font-mono">{n(totals.views)}</span> 次，
                    <span className="font-mono">{n(totals.sympathy)}</span> 人点了「共感した」（我也想知道 / 我也是）。
                  </>
                )}
              </p>
              <div className="mt-2">
                <BarList
                  title="这一批里，每年新发的提问"
                  items={asksByYear(chiebukuro.asks, thisYear).map((y) => ({ label: `${y.year} 年`, value: y.count }))}
                  unit=" 个"
                />
              </div>
              {read.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {read.slice(0, 5).map((a) => (
                    <li key={a.url}>
                      <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-4 hover:underline">
                        {a.title}
                      </a>
                      <span className="ml-1 font-mono text-muted-foreground">
                        {a.date} · 看过 {n(a.views ?? 0)} · 共感 {n(a.sympathy ?? 0)} · 回答 {a.answers}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <details className="mt-1">
                <summary className="cursor-pointer text-muted-foreground">这一批的 {chiebukuro.asks.length} 个提问（新的在前）</summary>
                <ul className="mt-1 space-y-0.5">
                  {chiebukuro.asks.map((a) => (
                    <li key={a.url}>
                      <span className="mr-1 font-mono text-muted-foreground">{a.date}</span>
                      <a href={a.url} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:text-primary hover:underline">
                        {a.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
              <p className="mt-1 text-muted-foreground">
                这是 Google 挑出来的一批（偏热门、偏老的），不是知恵袋上的全部。看的是有没有人一直在问、哪几年问的多；看过的人数是累计的，越早发的越多。
                程序只读单个提问页（知恵袋的 robots.txt 允许），不碰搜索页。
              </p>
            </>
          )}
        </div>
      )}

      {asked !== undefined && (
        <div>
          <p className="text-sm font-medium">人们在「{topic}」后面还会搜什么</p>
          {asked === null ? (
            <p className="text-muted-foreground">这次没取到。</p>
          ) : asked.length === 0 ? (
            <p className="text-muted-foreground">联想里没有更多的说法（搜的人少，或者叫法不对）。</p>
          ) : (
            <>
              <p>{asked.map((s) => `「${s}」`).join("")}</p>
              <p className="text-muted-foreground">
                在叫法后面加一个假名（あ、か、さ……）再问一遍 Google 联想，问出来的这些都是真有人在搜的说法 —— 担心什么、想比较什么、卡在哪一步。
                里面混着书名、动画名这类不相干的，略过就好；挑几个放进 Google 趋势一起比，看哪个担心在变多。
              </p>
            </>
          )}
        </div>
      )}

      {kokkai !== undefined && (
        <div>
          {kokkai === null ? (
            <>
              <p className="text-sm font-medium">国会里提到「{topic}」几次</p>
              <p className="text-muted-foreground">这次没取到（国会会议录的接口有时很慢）。</p>
            </>
          ) : (
            <>
              <BarList
                title={`国会里提到「${topic}」的发言，每年几次`}
                items={kokkai.map((y) => ({ label: `${y.year} 年`, value: y.count }))}
                unit=" 次"
                empty={`最近 ${kokkai.length} 年国会里一次都没提过。`}
              />
              <p className="mt-1 text-muted-foreground">
                国会会议录的官方接口，顺口提到一句也算一次。国会里谈得多的那几年，往往是规制在动（特区、补助、放宽）—— 时差图谱里「被法规卡住」的那一类，看这个就知道口子有没有在松。
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
