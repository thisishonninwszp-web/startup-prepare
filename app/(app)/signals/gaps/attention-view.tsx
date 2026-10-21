import { wikiYears, type Attention } from "@/lib/domains/signals/attention-shared";
import { MonthLine } from "@/components/ui/month-line";
import { TrendsChart } from "@/components/trends-chart";
import { AsksView } from "@/components/asks-view";

const n = (v: number) => v.toLocaleString("ja-JP");

/** 楽天要求原样使用的署名（webservice.rakuten.co.jp/guide/credit 的文字版，改了 HTML 可能被停用接口）。 */
const RAKUTEN_CREDIT =
  '<!-- Rakuten Web Services Attribution Snippet FROM HERE --><a href="https://developers.rakuten.com/" target="_blank">Supported by Rakuten Developers</a><!-- Rakuten Web Services Attribution Snippet TO HERE -->';

/** 最近 12 个月、再往前 12 个月各加起来多少（只数，不算涨了百分之几）。 */
function yearSums(values: number[]): { last: number; prev: number | null } {
  const last = values.slice(-12).reduce((a, b) => a + b, 0);
  const before = values.slice(-24, -12);
  return { last, prev: before.length === 12 ? before.reduce((a, b) => a + b, 0) : null };
}

/**
 * 有多少人在关注这件事（程序自动查的，不花钱）：维基浏览量、搜索联想、はてな收藏、YouTube。
 * 只数次数；只说明有多少人在查、在找、在看，不说明愿不愿付钱。
 */
export function AttentionView({ attention }: { attention: Attention }) {
  const a = attention;
  const years = a.wiki ? wikiYears(a.wiki.months) : null;
  return (
    <div className="mt-3 rounded-md border border-border p-3 text-xs leading-6">
      <p className="text-sm font-medium">有多少人在关注「{a.topic}」</p>
      <ul className="mt-1 space-y-1">
        <li>
          <span className="text-muted-foreground">维基百科：</span>
          {a.wiki && years ? (
            <>
              <a href={a.wiki.url} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-4 hover:underline">
                「{a.wiki.title}」
              </a>
              最近 12 个月有 <span className="font-mono">{n(years.last)}</span> 次浏览
              {years.prev !== null && (
                <>
                  ，再往前 12 个月 <span className="font-mono">{n(years.prev)}</span> 次
                </>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">没有对得上的词条</span>
          )}
        </li>
        <li>
          <span className="text-muted-foreground">Google 搜索联想（人们在后面最常接着搜什么）：</span>
          {a.suggest === null ? (
            <span className="text-muted-foreground">这次没取到</span>
          ) : a.suggest.length > 0 ? (
            a.suggest.map((s) => `「${s}」`).join("")
          ) : (
            <span className="text-muted-foreground">这个词后面没有常见的联想（搜的人少，或者叫法不对）</span>
          )}
        </li>
        <li>
          <span className="text-muted-foreground">はてなブックマーク：</span>
          {a.hatena && a.hatena.matched > 0 ? (
            <>
              标题里有这个词的文章 <span className="font-mono">{n(a.hatena.matched)}</span> 篇，一共{" "}
              <span className="font-mono">{n(a.hatena.bookmarks)}</span> 人收藏；最多人收藏的：
              <ul className="ml-4 mt-1 space-y-0.5">
                {a.hatena.top.map((t) => (
                  <li key={t.url}>
                    <a href={t.url} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-4 hover:underline">
                      {t.title}
                    </a>
                    <span className="ml-1 font-mono text-muted-foreground">
                      {n(t.users)} 人 · {t.date}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <span className="text-muted-foreground">标题里有这个词的文章没搜到</span>
          )}
        </li>
        <li>
          <span className="text-muted-foreground">YouTube：</span>
          {a.youtube === "no-key" ? (
            <span className="text-muted-foreground">没配 YOUTUBE_API_KEY（免费申请，配上以后能看到讲这件事的视频有多少、播放多少）</span>
          ) : a.youtube ? (
            <>
              {a.youtube.total !== null && (
                <>
                  约 <span className="font-mono">{n(a.youtube.total)}</span> 条视频（YouTube 给的是估算）；
                </>
              )}
              播放最多的：
              <ul className="ml-4 mt-1 space-y-0.5">
                {a.youtube.videos.map((v) => (
                  <li key={v.url}>
                    <a href={v.url} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-4 hover:underline">
                      {v.title}
                    </a>
                    <span className="ml-1 font-mono text-muted-foreground">
                      {n(v.views)} 次 · {v.published}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <span className="text-muted-foreground">这次没取到</span>
          )}
        </li>
        <li>
          <span className="text-muted-foreground">楽天市场（已经有人在花钱的痕迹）：</span>
          {a.rakuten === undefined ? (
            <span className="text-muted-foreground">这条是早先查的，换一批再找就有</span>
          ) : a.rakuten === "no-key" ? (
            <span className="text-muted-foreground">没配楽天的 Key（RAKUTEN_APPLICATION_ID / RAKUTEN_ACCESS_KEY，免费申请）</span>
          ) : a.rakuten && "error" in a.rakuten ? (
            <span className="text-muted-foreground">这次没取到（{a.rakuten.error}）</span>
          ) : a.rakuten ? (
            <>
              {a.rakuten.count !== null && (
                <>
                  搜「{a.topic}」有 <span className="font-mono">{n(a.rakuten.count)}</span> 件商品；
                </>
              )}
              评价最多的 30 件一共 <span className="font-mono">{n(a.rakuten.reviews)}</span> 条评价
              {a.rakuten.medianPrice !== null && (
                <>
                  ，价格中位数 <span className="font-mono">{n(a.rakuten.medianPrice)}</span> 日元
                </>
              )}
              ：
              <ul className="ml-4 mt-1 space-y-0.5">
                {a.rakuten.top.map((t) => (
                  <li key={t.url}>
                    <a href={t.url} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-4 hover:underline">
                      {t.name.slice(0, 50)}
                    </a>
                    <span className="ml-1 font-mono text-muted-foreground">
                      {n(t.price)} 日元 · {n(t.reviews)} 条评价
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <span className="text-muted-foreground">这次没取到</span>
          )}
        </li>
        <li>
          <span className="text-muted-foreground">家计调查（日本家庭每月在这一类上花多少钱）：</span>
          {a.kakei === undefined ? (
            <span className="text-muted-foreground">这条是早先查的，换一批再找就有</span>
          ) : a.kakei === "no-key" ? (
            <span className="text-muted-foreground">没配 e-Stat 的 ESTAT_APP_ID（免费申请）</span>
          ) : a.kakei && a.kakei.items.length > 0 ? (
            <ul className="ml-4 mt-1 space-y-0.5">
              {a.kakei.revision && (
                <li className="text-muted-foreground">
                  用的是 {a.kakei.revision} 年改定的品目分类
                  {a.kakei.joined ? `；前面的月份用 ${a.kakei.joined} 年改定里同名的那一项补上（改定时定义可能有变）` : ""}
                </li>
              )}
              {a.kakei.items.map((k) => {
                const sums = yearSums(k.months.map((m) => m.value));
                return (
                  <li key={k.name}>
                    「{k.name}」：最近 12 个月每户一共 <span className="font-mono">{n(Math.round(sums.last))}</span> 日元
                    {sums.prev !== null && (
                      <>
                        ，再往前 12 个月 <span className="font-mono">{n(Math.round(sums.prev))}</span> 日元
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : a.kakei ? (
            <span className="text-muted-foreground">家计调查的品目里没有直接对应这件事的</span>
          ) : (
            <span className="text-muted-foreground">这次没取到</span>
          )}
        </li>
      </ul>
      <div className="mt-3 border-t border-border pt-3">
        <AsksView
          topic={a.topic}
          chiebukuro={a.chiebukuro}
          asked={a.asked}
          kokkai={a.kokkai}
          youtubeYears={a.youtubeYears}
          reddit={a.reddit}
          thisYear={Number(a.checked_at.slice(0, 4))}
        />
      </div>
      {a.wiki && a.wiki.months.length >= 2 && (
        <div className="mt-3">
          <MonthLine
            title={`维基百科「${a.wiki.title}」每个月被看了几次（${a.wiki.months[0].month} 起）`}
            points={a.wiki.months.map((m) => ({ month: m.month, value: m.views }))}
            unit="次"
            split={a.wiki.months.length > 12 ? a.wiki.months.length - 12 : undefined}
          />
        </div>
      )}
      <div className="mt-3">
        {/* key：重新听一听换了叫法时，图跟着换（不然会留着上一次的词） */}
        <TrendsChart key={a.topic} words={[a.topic]} />
      </div>
      {a.kakei && a.kakei !== "no-key" &&
        a.kakei.items.map((k) =>
          k.months.length >= 2 ? (
            <div key={k.name} className="mt-3">
              <MonthLine
                title={`家计调查「${k.name}」：二人以上的家庭每户每月花多少（全国平均）`}
                points={k.months}
                unit="日元"
                split={k.months.length > 12 ? k.months.length - 12 : undefined}
              />
            </div>
          ) : null
        )}
      {a.rakuten && a.rakuten !== "no-key" && !("error" in a.rakuten) && (
        // 署名必须照楽天给的 HTML 原样放，不能加 class / rel，所以用固定字符串插进去（内容是写死的常量，不是外来数据）
        <p className="mt-2 text-muted-foreground" dangerouslySetInnerHTML={{ __html: RAKUTEN_CREDIT }} />
      )}
      <p className="mt-2 text-muted-foreground">
        程序自动查的，不花钱，只数次数。说明有多少人在查、在找、在看这件事，不说明愿不愿付钱；两个数比着看（这件事 vs 另一件、今年 vs 去年）比一个绝对数有用。
        搜索联想会按 Google 猜的所在地带上地名，大的已经去掉了。
      </p>
    </div>
  );
}
