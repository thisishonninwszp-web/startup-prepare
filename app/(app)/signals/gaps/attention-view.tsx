import { wikiYears, type Attention } from "@/lib/domains/signals/attention-shared";

const n = (v: number) => v.toLocaleString("ja-JP");

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
          {a.suggest.length > 0 ? a.suggest.map((s) => `「${s}」`).join("") : <span className="text-muted-foreground">这次没取到</span>}
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
      </ul>
      <p className="mt-2 text-muted-foreground">
        程序自动查的，不花钱，只数次数。说明有多少人在查、在找、在看这件事，不说明愿不愿付钱；两个数比着看（这件事 vs 另一件、今年 vs 去年）比一个绝对数有用。
        搜索联想会按 Google 猜的所在地带上地名，大的已经去掉了。
      </p>
    </div>
  );
}
