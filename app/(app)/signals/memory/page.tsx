import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { tokyoToday } from "@/lib/domains/signals/brief";
import { archiveCoverage, MARK_LABELS, recentMarks, RESURFACE_LABELS, resurfaced } from "@/lib/domains/signals/memory";
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
  const [coverage, marks, back] = await Promise.all([
    archiveCoverage().catch(() => null),
    recentMarks(user.id, 30).catch(() => null),
    resurfaced(user.id, today).catch(() => []),
  ]);

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

      {back.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-base font-semibold">回头看</h2>
          <ul className="space-y-4">
            {back.map((r) => (
              <li key={`${r.daysAgo}-${r.item.signal_id}`} className="rounded-lg border border-border bg-card p-4 text-sm leading-7">
                <p className="text-xs text-muted-foreground">
                  {RESURFACE_LABELS[r.daysAgo]}你标了「{MARK_LABELS[r.item.mark]}」
                  {r.item.note ? `：${r.item.note}` : ""}
                </p>
                <Link href={`/signals/${r.item.signal_id}`} className="font-medium transition-colors duration-150 hover:text-primary">
                  {r.item.title ?? "（没有标题）"}
                </Link>
                {r.later.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    <li className="text-xs text-muted-foreground">后来：</li>
                    {r.later.map((h) => (
                      <li key={h.id}>
                        <span className="mr-2 font-mono text-xs text-muted-foreground">{h.fetched_at.slice(0, 10)}</span>
                        <Link href={`/signals/${h.id}`} className="transition-colors duration-150 hover:text-primary">
                          {h.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">存档里还没有它后来的消息。</p>
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
            这里空着。看新闻时在详情页点一下「重要 / 跟我有关 / 存疑」，过一周、一个月、一年会在「回头看」再拿出来给你，连同它后来怎样了。
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
