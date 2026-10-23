import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { tokyoToday } from "@/lib/domains/signals/brief";
import {
  archiveCoverage,
  FOLLOW_DAYS,
  followedSignals,
  interestGroups,
  KIND_TITLES,
  MARK_LABELS,
  recentMarks,
  storyUpdates,
  type StoryUpdate,
} from "@/lib/domains/signals/memory";
import { sharedViewFor } from "@/lib/domains/signals/users";
import { StoryList } from "../today-blocks";
import { RecallCard } from "../recall-card";
import { dueRecalls } from "@/lib/domains/signals/recall";

/** 「你在跟的事」看最近多少天的后续。 */
const STORY_DAYS = 30;

/** 「你最近在意什么」看最近多少天标的。 */
const INTEREST_DAYS = 60;
import { ArchiveSearch, AskArchive } from "./archive-tools";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function MemoryPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const today = tokyoToday();
  const view = await sharedViewFor(user.id);
  const followed = await followedSignals(user.id, view.shared).catch((e) => {
    console.error("memory: followed", e);
    return [];
  });
  const [coverage, marks, recall, recent, stories] = await Promise.all([
    archiveCoverage().catch(() => null),
    recentMarks(user.id, 30).catch(() => null),
    dueRecalls(user.id, view.shared, today, 20).catch((e) => {
      console.error("memory: recall", e);
      return null;
    }),
    recentMarks(user.id, 300, INTEREST_DAYS).catch(() => null),
    storyUpdates(followed, new Date(Date.now() - STORY_DAYS * 86_400_000).toISOString(), 3).catch((e): StoryUpdate[] | "error" => {
      console.error("memory: stories", e);
      return "error";
    }),
  ]);
  const interests = recent ? interestGroups(recent) : [];

  return (
    <PageContainer width="narrow">
      <PageHeader
        eyebrow="Memory"
        title="记忆"
        description="每天抓到的新闻一条都不删，全在这里。看过多少不算数，以后找得到、当时点过一下的，才想得起来 —— 所以存和找交给程序，你只在看到时点一下「重要 / 跟我有关 / 存疑」。"
      />

      {coverage === null ? (
        <p className="mb-8 text-sm leading-7 text-muted-foreground">
          还差一步：迁移 091 没跑。执行 supabase/migrations/091_signal_memory_forecasts.sql 之后，存档才能按意思找。
        </p>
      ) : (
        <p className="mb-8 font-mono text-xs text-muted-foreground">
          存档 {coverage.total.toLocaleString("ja-JP")} 条，能按意思找的 {coverage.embedded.toLocaleString("ja-JP")} 条
          {coverage.total > coverage.embedded ? "（剩下的每天早晚各算一批）" : ""}
        </p>
      )}

      <section className="mb-10">
        <h2 className="mb-3 text-base font-semibold">找</h2>
        <ArchiveSearch />
      </section>

      <section className="mb-10">
        <h2 className="mb-1 text-base font-semibold">问存档</h2>
        <p className="mb-3 text-xs leading-6 text-muted-foreground">「我以前看过的关于 X 的都有什么」「X 这件事后来怎样了」—— 只用存档里的回答，每句带出处。</p>
        <AskArchive />
      </section>

      {followed.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-1 text-base font-semibold">你在跟的事</h2>
          {stories === null ? (
            <p className="text-sm leading-7 text-muted-foreground">还差一步：迁移 093 没跑。执行 supabase/migrations/093_signal_today.sql 之后，这里列出你在跟的事后来的消息。</p>
          ) : stories === "error" ? (
            <p className="text-sm leading-7 text-muted-foreground">这一块这次没取到，刷新一下再试。</p>
          ) : (
            <>
              <p className="text-xs leading-6 text-muted-foreground">
                最近 {FOLLOW_DAYS} 天你标过、记成观察、写过判断的 {followed.length} 件事里，这 {STORY_DAYS} 天有后续的 {stories.length} 件。
              </p>
              {stories.length > 0 && <StoryList stories={stories} />}
            </>
          )}
        </section>
      )}

      {recall && (
        <section id="recall" className="mb-10 scroll-mt-20">
          <h2 className="mb-1 text-base font-semibold">回想</h2>
          <p className="mb-3 text-xs leading-6 text-muted-foreground">
            你标过、记成观察、写过判断的，第一次在一周后问，之后按你说的记得 / 模糊 / 忘了排：记得的越隔越久（最长一年），忘了的过一周再问。自己想起来一次，比再看一遍记得牢。
          </p>
          {recall.items.length === 0 ? (
            <p className="text-sm leading-7 text-muted-foreground">今天没有到期的。</p>
          ) : (
            <div className="space-y-3">
              {recall.items.map((item) => (
                <RecallCard key={item.signal_id} item={item} />
              ))}
            </div>
          )}
        </section>
      )}

      {interests.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-1 text-base font-semibold">你最近在意什么</h2>
          <p className="mb-3 text-xs leading-6 text-muted-foreground">
            最近 {INTEREST_DAYS} 天你标过的，按报告的几节数一数；底下是你自己写的为什么。以后画你的画像用的是这些原话，不是 AI 的概括。
          </p>
          <ul className="space-y-4">
            {interests.map((g) => (
              <li key={g.kind} className="text-sm leading-7">
                <p>
                  <span className="font-medium">{KIND_TITLES[g.kind]}</span>
                  <span className="ml-2 font-mono text-xs text-muted-foreground">{g.count} 条</span>
                </p>
                {g.reasons.length > 0 ? (
                  <ul className="mt-1 space-y-1 border-l border-border pl-3">
                    {g.reasons.slice(0, 8).map((r) => (
                      <li key={r.signal_id} className="text-xs leading-6">
                        <span className="text-foreground">{r.note}</span>
                        <Link href={`/signals/${r.signal_id}`} className="ml-2 text-muted-foreground transition-colors duration-150 hover:text-primary">
                          {r.title ?? "（没有标题）"}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">这一节标过的都没写为什么。</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-base font-semibold">你标过的</h2>
        {marks === null ? (
          <p className="text-sm text-muted-foreground">迁移 091 跑完之后才能标。</p>
        ) : marks.length === 0 ? (
          <p className="text-sm leading-7 text-muted-foreground">
            这里空着。看新闻时在详情页点一下「重要 / 跟我有关 / 存疑」，顺手写一句为什么在意（可以不写）；过一周会在「回想」里问你一次还记不记得，记得的越隔越久再问。
          </p>
        ) : (
          <ul className="space-y-2">
            {marks.map((m) => (
              <li key={m.signal_id} className="text-sm leading-7">
                <span className="mr-2 font-mono text-xs text-muted-foreground">{m.created_at.slice(0, 10)}</span>
                <span className="mr-2 text-xs text-primary">{MARK_LABELS[m.mark]}</span>
                <Link href={`/signals/${m.signal_id}`} className="transition-colors duration-150 hover:text-primary">
                  {m.title ?? "（没有标题）"}
                </Link>
                {m.note && <span className="ml-1 text-xs text-muted-foreground">—— {m.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageContainer>
  );
}
