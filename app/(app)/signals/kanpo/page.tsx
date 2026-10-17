import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { tokyoDate } from "@/lib/domains/jobs/shared";
import { kanpoStatus, MISSING_KANPO_MIGRATION, searchNotices, watchBoard } from "@/lib/domains/signals/kanpo";
import { NoticeLine } from "./notice-line";
import { RejectMatchButton, RemoveWatchButton } from "./watch-actions";
import { WatchForm } from "./watch-form";

export const dynamic = "force-dynamic";

const STALE_DAYS = 3;

export default async function KanpoPage({ searchParams }: { searchParams: { q?: string; case?: string; note?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const [status, board] = await Promise.all([kanpoStatus(), watchBoard(user.id)]);
  const q = (searchParams.q ?? "").trim();
  const caseId = searchParams.case && /^[0-9a-f-]{36}$/i.test(searchParams.case) ? searchParams.case : null;

  if (status === "missing-schema" || board === "missing-schema") {
    return (
      <PageContainer width="narrow">
        <PageHeader title="在日本的中国公司" />
        <p className="text-sm leading-7 text-muted-foreground">{MISSING_KANPO_MIGRATION}</p>
      </PageContainer>
    );
  }
  const results = q ? await searchNotices(q) : [];
  const staleDays = status.lastDay ? Math.floor((Date.parse(tokyoDate()) - Date.parse(status.lastDay)) / 86_400_000) : null;

  return (
    <PageContainer width="narrow">
      <p className="mb-4 text-sm">
        <Link href="/signals/atlas" className="text-muted-foreground transition-colors duration-150 hover:text-foreground">
          ← 时差图谱
        </Link>
      </p>
      <PageHeader
        eyebrow="Kanpo"
        title="在日本的中国公司"
        description="进了日本以后成绩怎样，看它登在官报上的决算公告：总资产、当期赚了还是亏了、累计亏损多少。数字是从官报原文里按规则截的，每条都附官报那一页。只摆数字，不评好坏。"
      />

      <div className="space-y-10 text-sm leading-7">
        <section>
          <h2 className="text-base font-semibold">名单（{board.length} 家）</h2>
          {board.length === 0 ? (
            <p className="mt-2 text-muted-foreground">这里空着。在下面加一家：写上中国那边的名字，和它在日本登记的公司名。</p>
          ) : (
            <ul className="mt-3 space-y-5">
              {board.map(({ watch, notices }) => (
                <li key={watch.id} className="border-b border-border pb-4 last:border-b-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium">
                      {watch.name_zh}
                      <span className="ml-2 font-normal text-muted-foreground">{watch.aliases.join(" / ")}</span>
                    </p>
                    <RemoveWatchButton id={watch.id} />
                  </div>
                  {watch.note && <p className="text-xs text-muted-foreground">{watch.note}</p>}
                  {notices.length === 0 ? (
                    <p className="mt-1 text-muted-foreground">抓到的官报里还没找到它登决算。可能登在自己网站上、不登，或者日本法人名的写法不一样。</p>
                  ) : (
                    <ul className="mt-1 space-y-1">
                      {notices.map((n) => (
                        <li key={n.id} className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-muted-foreground">{n.company_name}：</span>
                          <NoticeLine notice={n} />
                          {n.company_key && <RejectMatchButton id={watch.id} companyKey={n.company_key} />}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="text-base font-semibold">加一家</h2>
          <p className="mt-1 text-xs text-muted-foreground">日本法人名要写官报上登的那个（例：株式会社〇〇ジャパン）。不让 AI 猜 —— 猜错了会把别家的决算挂到它头上。</p>
          <div className="mt-3">
            <WatchForm caseId={caseId} note={searchParams.note ?? ""} />
          </div>
        </section>

        <section>
          <h2 className="text-base font-semibold">搜官报决算</h2>
          <form method="get" className="mt-3 flex gap-2">
            <Input name="q" defaultValue={q} placeholder="公司名的一部分，例：ジャパン" className="h-9" />
            <Button type="submit" size="sm" variant="outline">
              搜
            </Button>
          </form>
          {q && (
            <ul className="mt-3 space-y-1">
              {results.length === 0 ? (
                <li className="text-muted-foreground">抓到的官报里没有名字里带「{q}」的决算公告。</li>
              ) : (
                results.map((n) => (
                  <li key={n.id}>
                    <span className="text-xs text-muted-foreground">{n.company_name}：</span>
                    <NoticeLine notice={n} />
                  </li>
                ))
              )}
            </ul>
          )}
        </section>

        <footer className="border-t border-border pt-4 text-xs leading-6 text-muted-foreground">
          <p>
            {status.lastDay
              ? `抓到 ${status.lastDay} 的官报，一共存了 ${status.notices} 条决算公告，其中 ${status.incomplete} 条没抽全（原文留着）。`
              : "还没抓过官报。"}
            {(staleDays === null || staleDays > STALE_DAYS) && " 在你电脑上跑一下 npm run kanpo:fetch（或者开着填表助手，它每天会顺手抓）。"}
          </p>
          <p>只有在官报登决算公告的公司才查得到；很多公司登在自己网站上或者不登。官报免费的只有最近 90 天，这里从开始抓的那天往后攒。</p>
        </footer>
      </div>
    </PageContainer>
  );
}
