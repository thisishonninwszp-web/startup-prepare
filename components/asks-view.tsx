import type { ReactNode } from "react";
import { BarList } from "@/components/ui/bar-list";
import {
  asksByYear,
  readTotals,
  type ChiebukuroSample,
  type KokkaiYears,
  type RedditSample,
  type YoutubeYears,
} from "@/lib/domains/signals/asks-shared";
import type { CfSample, GcSample, PrSample } from "@/lib/domains/signals/sites-shared";

const n = (v: number) => v.toLocaleString("ja-JP");

const linkClass = "text-primary underline-offset-4 hover:underline";

function Title({ children }: { children: ReactNode }) {
  return <p className="text-sm font-medium">{children}</p>;
}

function Note({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-muted-foreground">{children}</p>;
}

function Missing({ children = "这次没取到。" }: { children?: ReactNode }) {
  return <p className="text-muted-foreground">{children}</p>;
}

function Chiebukuro({ topic, sample, thisYear }: { topic: string; sample: ChiebukuroSample | null; thisYear: number }) {
  if (sample === null) {
    return (
      <div>
        <Title>知恵袋上有多少人在问「{topic}」</Title>
        <Missing>这次没取到（Google 没搜成，或者知恵袋没响应），过一会儿再查。</Missing>
      </div>
    );
  }
  if (sample.asks.length === 0) {
    return (
      <div>
        <Title>知恵袋上有多少人在问「{topic}」</Title>
        <Missing>
          Google 找到 {sample.found} 页提问，读了 {sample.read} 页，标题里有「{topic}」的一个都没有 —— 换个普通人会怎么问的说法再试。
        </Missing>
      </div>
    );
  }
  const totals = readTotals(sample.asks);
  const read = sample.asks.filter((a) => a.views !== undefined).sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
  return (
    <div>
      <Title>知恵袋上有多少人在问「{topic}」</Title>
      <p>
        Google 找到 <span className="font-mono">{sample.found}</span> 页提问、读了 <span className="font-mono">{sample.read}</span> 页，
        连同每页底下的相关提问，标题里有「{topic}」的一共 <span className="font-mono">{sample.asks.length}</span> 个。
        {totals.pages > 0 && (
          <>
            读过的 {totals.pages} 页一共被看了 <span className="font-mono">{n(totals.views)}</span> 次，
            <span className="font-mono">{n(totals.sympathy)}</span> 人点了「共感した」（我也想知道 / 我也是）。
          </>
        )}
      </p>
      <div className="mt-2">
        <BarList
          title="这一批里，每年新发的提问"
          items={asksByYear(sample.asks, thisYear).map((y) => ({ label: `${y.year} 年`, value: y.count }))}
          unit=" 个"
        />
      </div>
      {read.length > 0 && (
        <ul className="mt-2 space-y-1">
          {read.slice(0, 5).map((a) => (
            <li key={a.url}>
              <a href={a.url} target="_blank" rel="noopener noreferrer" className={linkClass}>
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
        <summary className="cursor-pointer text-muted-foreground">这一批的 {sample.asks.length} 个提问（新的在前）</summary>
        <ul className="mt-1 space-y-0.5">
          {sample.asks.map((a) => (
            <li key={a.url}>
              <span className="mr-1 font-mono text-muted-foreground">{a.date}</span>
              <a href={a.url} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:text-primary hover:underline">
                {a.title}
              </a>
            </li>
          ))}
        </ul>
      </details>
      <Note>
        这是 Google 挑出来的一批（偏热门、偏老的），不是知恵袋上的全部。看的是有没有人一直在问、哪几年问的多；看过的人数是累计的，越早发的越多。
        程序只读单个提问页（知恵袋的 robots.txt 允许），不碰搜索页。
      </Note>
    </div>
  );
}

function Girlschannel({ topic, sample, thisYear }: { topic: string; sample: GcSample | null; thisYear: number }) {
  if (sample === null) {
    return (
      <div>
        <Title>ガルちゃん上有多少人在聊「{topic}」</Title>
        <Missing />
      </div>
    );
  }
  if (sample.topics.length === 0) {
    return (
      <div>
        <Title>ガルちゃん上有多少人在聊「{topic}」</Title>
        <Missing>
          {sample.total ? `搜出 ${sample.total} 个讨论，标题里有「${topic}」的一个都没有。` : "一个讨论都没有 —— 换个平时说的说法再试。"}
        </Missing>
      </div>
    );
  }
  const comments = sample.topics.reduce((s, t) => s + t.comments, 0);
  const top = [...sample.topics].sort((a, b) => b.comments - a.comments).slice(0, 5);
  return (
    <div>
      <Title>ガルちゃん上有多少人在聊「{topic}」</Title>
      <p>
        {sample.total !== null && <>搜出 <span className="font-mono">{sample.total}</span> 个讨论（最多看前 100 个），</>}
        标题里有「{topic}」的 <span className="font-mono">{sample.topics.length}</span> 个，
        一共 <span className="font-mono">{n(comments)}</span> 条评论。
      </p>
      <div className="mt-2">
        <BarList
          title="每年新开的讨论"
          items={asksByYear(sample.topics, thisYear).map((y) => ({ label: `${y.year} 年`, value: y.count }))}
          unit=" 个"
        />
      </div>
      <ul className="mt-2 space-y-1">
        {top.map((t) => (
          <li key={t.url}>
            <a href={t.url} target="_blank" rel="noopener noreferrer" className={linkClass}>
              {t.title}
            </a>
            <span className="ml-1 font-mono text-muted-foreground">
              {t.date} · 评论 {n(t.comments)}
            </span>
          </li>
        ))}
      </ul>
      <Note>
        日本最大的女性讨论区，主妇、上班族、带孩子的人多 —— 家务、育儿、美容、生活里的麻烦，这里常有人开一个讨论问「大家怎么办」。
        评论多的那几个，就是很多人有话要说的地方，点进去看他们真正在烦什么。
      </Note>
    </div>
  );
}

function Reddit({ reddit, term, thisYear }: { reddit: RedditSample | "no-key" | null; term?: string; thisYear: number }) {
  const shown = reddit && reddit !== "no-key" ? reddit.term : term || "（英文说法）";
  if (reddit === "no-key" || reddit === null) {
    return (
      <div>
        <Title>在日外国人在 Reddit 上问「{shown}」</Title>
        <Missing>
          {reddit === "no-key"
            ? "没配 Reddit 的 Key（REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET），这一样不查。免费，但 2025-11 起新应用要先向 Reddit 申请、人工审批。"
            : "这次没取到。"}
        </Missing>
      </div>
    );
  }
  if (reddit.posts.length === 0) {
    return (
      <div>
        <Title>在日外国人在 Reddit 上问「{shown}」</Title>
        <Missing>
          在 {reddit.subs.map((s) => `r/${s}`).join("、")} 里翻了 {reddit.searched} 条，正文里有这个说法的一条都没有。
        </Missing>
      </div>
    );
  }
  const top = [...reddit.posts].sort((a, b) => b.comments - a.comments).slice(0, 5);
  return (
    <div>
      <Title>在日外国人在 Reddit 上问「{shown}」</Title>
      <p>
        在 {reddit.subs.map((s) => `r/${s}`).join("、")} 里翻了 <span className="font-mono">{reddit.searched}</span> 条，
        标题或正文里有「{reddit.term}」的 <span className="font-mono">{reddit.posts.length}</span> 条。
      </p>
      <div className="mt-2">
        <BarList title="每年几条" items={asksByYear(reddit.posts, thisYear).map((y) => ({ label: `${y.year} 年`, value: y.count }))} unit=" 条" />
      </div>
      <ul className="mt-2 space-y-1">
        {top.map((p) => (
          <li key={p.url}>
            <a href={p.url} target="_blank" rel="noopener noreferrer" className={linkClass}>
              {p.title}
            </a>
            <span className="ml-1 font-mono text-muted-foreground">
              r/{p.sub} · {p.date} · 评论 {n(p.comments)}
            </span>
          </li>
        ))}
      </ul>
      <Note>
        Reddit 官方接口，从新到旧最多翻 300 条，讨论多的话只覆盖最近几年。这些是在日本生活、用英语的人 —— 你的想法要是给外国人用的，这里就是他们自己说出来的麻烦。
      </Note>
    </div>
  );
}

function Asked({ topic, asked }: { topic: string; asked: string[] | null }) {
  return (
    <div>
      <Title>人们在「{topic}」后面还会搜什么</Title>
      {asked === null ? (
        <Missing />
      ) : asked.length === 0 ? (
        <Missing>联想里没有更多的说法（搜的人少，或者叫法不对）。</Missing>
      ) : (
        <>
          <p>{asked.map((s) => `「${s}」`).join("")}</p>
          <Note>
            在叫法后面加一个假名（あ、か、さ……）再问一遍 Google 联想，问出来的这些都是真有人在搜的说法 —— 担心什么、想比较什么、卡在哪一步。
            里面混着书名、动画名这类不相干的，略过就好；挑几个放进 Google 趋势一起比，看哪个担心在变多。
          </Note>
        </>
      )}
    </div>
  );
}

function Campfire({ topic, sample }: { topic: string; sample: CfSample | null }) {
  if (sample === null) {
    return (
      <div>
        <Title>CAMPFIRE 上有没有人为「{topic}」先掏钱</Title>
        <Missing />
      </div>
    );
  }
  if (sample.projects.length === 0) {
    return (
      <div>
        <Title>CAMPFIRE 上有没有人为「{topic}」先掏钱</Title>
        <Missing>
          {sample.total ? `搜出 ${sample.total} 个项目，标题里有「${topic}」的一个都没有。` : "一个众筹项目都没有。"}
          没人试过，可能是没人想要，也可能是还没人想到 —— 这一样单看说明不了哪个。
        </Missing>
      </div>
    );
  }
  const raised = sample.projects.reduce((s, p) => s + p.amount, 0);
  const backers = sample.projects.reduce((s, p) => s + p.backers, 0);
  const open = sample.projects.filter((p) => p.open).length;
  return (
    <div>
      <Title>CAMPFIRE 上有没有人为「{topic}」先掏钱</Title>
      <p>
        {sample.total !== null && <>搜出 <span className="font-mono">{sample.total}</span> 个项目，</>}
        这一页 {sample.seen} 个里标题有「{topic}」的 <span className="font-mono">{sample.projects.length}</span> 个
        {open > 0 && <>（还在募集的 {open} 个）</>}，一共筹到 <span className="font-mono">{n(raised)}</span> 日元、
        <span className="font-mono">{n(backers)}</span> 人支持。
      </p>
      <ul className="mt-2 space-y-1">
        {sample.projects.slice(0, 6).map((p) => (
          <li key={p.url}>
            <a href={p.url} target="_blank" rel="noopener noreferrer" className={linkClass}>
              {p.title}
            </a>
            <span className="ml-1 font-mono text-muted-foreground">
              {n(p.amount)} 日元 · {n(p.backers)} 人{p.open ? " · 还在募集" : ""}
            </span>
          </li>
        ))}
      </ul>
      <Note>
        众筹是陌生人为还不存在的东西先付钱 —— 离「愿付钱」最近的公开数据。几个人、几千日元的，多半是做的人自己的朋友在捧场；
        几百人、几百万日元的，才是陌生人真的想要。网站的总数连正文里提到的也算，这里只数标题里有这个词的。
      </Note>
    </div>
  );
}

function Youtube({ topic, years }: { topic: string; years: YoutubeYears | "no-key" | null }) {
  if (years === "no-key" || years === null) {
    return (
      <div>
        <Title>YouTube 上每年新上传几条讲「{topic}」的视频</Title>
        <Missing>{years === "no-key" ? "没配 YOUTUBE_API_KEY，这一样不查。" : "这次没取到。"}</Missing>
      </div>
    );
  }
  return (
    <div>
      <BarList
        title={`YouTube 上每年新上传、标题里有「${topic}」的视频`}
        items={years.map((y) => ({ label: `${y.year} 年${y.capped ? "（还有更多）" : ""}`, value: y.count }))}
        unit=" 条"
        empty={`最近 ${years.length} 年一条都没有。`}
      />
      <Note>
        YouTube 官方接口，每年只看搜出来的前 50 条、数标题里有这个词的；标了「还有更多」的那年前 50 条都没看完，实际比这个多。拍视频的人多了，说明有人觉得这件事值得讲、有人看。
      </Note>
    </div>
  );
}

function Prtimes({ topic, sample }: { topic: string; sample: PrSample | null }) {
  if (sample === null) {
    return (
      <div>
        <Title>PR TIMES 上最近谁在发「{topic}」的新闻稿</Title>
        <Missing />
      </div>
    );
  }
  const companies = Array.from(new Set(sample.releases.map((r) => r.company).filter(Boolean)));
  return (
    <div>
      <Title>PR TIMES 上最近谁在发「{topic}」的新闻稿</Title>
      {sample.releases.length === 0 ? (
        <Missing>
          {sample.total ? `提到这个词的新闻稿一共 ${n(sample.total)} 篇，最新的 ${sample.seen} 篇里标题有「${topic}」的一篇都没有。` : "一篇都没有。"}
        </Missing>
      ) : (
        <>
          <p>
            {sample.total !== null && <>提到这个词的新闻稿一共 <span className="font-mono">{n(sample.total)}</span> 篇；</>}
            最新的 {sample.seen} 篇里标题有「{topic}」的 <span className="font-mono">{sample.releases.length}</span> 篇
            （{sample.releases[sample.releases.length - 1].date} 到 {sample.releases[0].date}），来自 {companies.length} 家公司：
            {companies.slice(0, 8).join("、")}。
          </p>
          <ul className="mt-2 space-y-1">
            {sample.releases.slice(0, 5).map((r) => (
              <li key={r.url}>
                <span className="mr-1 font-mono text-muted-foreground">{r.date}</span>
                <a href={r.url} target="_blank" rel="noopener noreferrer" className={linkClass}>
                  {r.title}
                </a>
                {r.company && <span className="ml-1 text-muted-foreground">—— {r.company}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
      <Note>
        这一样量的是「有多少公司在做、在宣传」，是竞争热度，不是需求。发稿的公司多，说明市场有人在抢；也是你可以去看、去问的同行名单。
      </Note>
    </div>
  );
}

function Kokkai({ topic, years }: { topic: string; years: KokkaiYears | null }) {
  if (years === null) {
    return (
      <div>
        <Title>国会里提到「{topic}」几次</Title>
        <Missing>这次没取到（国会会议录的接口有时很慢）。</Missing>
      </div>
    );
  }
  return (
    <div>
      <BarList
        title={`国会里提到「${topic}」的发言，每年几次`}
        items={years.map((y) => ({ label: `${y.year} 年`, value: y.count }))}
        unit=" 次"
        empty={`最近 ${years.length} 年国会里一次都没提过。`}
      />
      <Note>
        国会会议录的官方接口，顺口提到一句也算一次。国会里谈得多的那几年，往往是规制在动（特区、补助、放宽）—— 时差图谱里「被法规卡住」的那一类，看这个就知道口子有没有在松。
      </Note>
    </div>
  );
}

function Group({ label, children }: { label: string; children: ReactNode[] }) {
  const shown = children.filter(Boolean);
  if (shown.length === 0) return null;
  return (
    <section className="space-y-4">
      <p className="border-b border-border pb-1 text-sm font-semibold">{label}</p>
      {shown}
    </section>
  );
}

/**
 * 有多少人在问、在花钱、在做（程序自动查的，不花钱）：分三组摆 ——
 * 有人在问、在头疼（知恵袋、ガルちゃん、Reddit、联想）/ 有人在花钱（CAMPFIRE）/ 有人在做、在讲（PR TIMES、YouTube、国会）。
 * undefined = 早先查的那次还没有这一样（或这次没要查），不显示；null = 这次没取到。
 */
export function AsksView({
  topic,
  chiebukuro,
  girlschannel,
  campfire,
  prtimes,
  asked,
  kokkai,
  youtubeYears,
  reddit,
  redditTerm,
  thisYear,
}: {
  topic: string;
  chiebukuro?: ChiebukuroSample | null;
  girlschannel?: GcSample | null;
  campfire?: CfSample | null;
  prtimes?: PrSample | null;
  asked?: string[] | null;
  kokkai?: KokkaiYears | null;
  youtubeYears?: YoutubeYears | "no-key" | null;
  reddit?: RedditSample | "no-key" | null;
  /** AI 写的英文说法（没配 Key 时 reddit 里没有，标题用这个）。 */
  redditTerm?: string;
  thisYear: number;
}) {
  if ([chiebukuro, girlschannel, campfire, prtimes, asked, kokkai, youtubeYears, reddit].every((x) => x === undefined)) return null;
  return (
    <div className="space-y-6 text-xs leading-6">
      <Group label="有人在问、在头疼吗">
        {[
          chiebukuro !== undefined && <Chiebukuro key="chiebukuro" topic={topic} sample={chiebukuro} thisYear={thisYear} />,
          girlschannel !== undefined && <Girlschannel key="girlschannel" topic={topic} sample={girlschannel} thisYear={thisYear} />,
          reddit !== undefined && <Reddit key="reddit" reddit={reddit} term={redditTerm} thisYear={thisYear} />,
          asked !== undefined && <Asked key="asked" topic={topic} asked={asked} />,
        ]}
      </Group>
      <Group label="有人在花钱吗">{[campfire !== undefined && <Campfire key="campfire" topic={topic} sample={campfire} />]}</Group>
      <Group label="有人在做、在讲吗">
        {[
          prtimes !== undefined && <Prtimes key="prtimes" topic={topic} sample={prtimes} />,
          youtubeYears !== undefined && <Youtube key="youtube" topic={topic} years={youtubeYears} />,
          kokkai !== undefined && <Kokkai key="kokkai" topic={topic} years={kokkai} />,
        ]}
      </Group>
    </div>
  );
}
