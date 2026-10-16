import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { listMarketApps } from "@/lib/domains/jobs/applications";
import { listCareerEntries } from "@/lib/domains/jobs/base";
import { listPostings } from "@/lib/domains/jobs/postings";
import { getJobProfile, MISSING_MIGRATION } from "@/lib/domains/jobs/profile";
import { categoryLabel, EFFECTIVE_LABELS, effectiveStatus, marketRows, tokyoDate } from "@/lib/domains/jobs/shared";
import { AddPostingForm } from "./add-posting-form";
import { BetForm } from "./bet-form";
import { CandidateList } from "./candidate-list";
import { JobSearchLoader } from "./job-search-loader";
import { MarketTable } from "./market-table";

export const dynamic = "force-dynamic";
// 每天第一次打开时在这一页的 server action 里搜岗位，要三四十秒
export const maxDuration = 60;

export default async function JobsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const profile = await getJobProfile(user.id);
  if (profile === "missing-schema") {
    return (
      <PageContainer>
        <PageHeader title="求职" />
        <p className="text-sm leading-7 text-muted-foreground">{MISSING_MIGRATION}</p>
      </PageContainer>
    );
  }

  const today = tokyoDate();
  const [{ picked, candidates }, apps, entries] = await Promise.all([
    listPostings(user.id),
    listMarketApps(user.id),
    listCareerEntries(user.id),
  ]);
  const confirmed = entries === "missing-schema" ? 0 : entries.filter((e) => e.confirmed_at).length;
  const statusByPosting = new Map(apps.map((a) => [a.posting_id, effectiveStatus(a, today)]));

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Jobs"
        title="求职"
        description="一个月后要能说出：哪类岗位投了几家、回了几家、对方提的年收大概多少。这里只数次数，不给岗位打分。"
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/jobs/base">底稿（确认过 {confirmed} 条）</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/jobs/profile">条件</Link>
            </Button>
          </>
        }
      />

      {!profile ? (
        <EmptyState
          title="先把条件填一下。"
          description="找哪几类、在哪、现在年收多少 —— 填好以后每天打开这一页，会按条件搜一轮岗位。"
          action={
            <Button asChild>
              <Link href="/jobs/profile">去填条件</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-12">
          <section>
            <h2 className="text-base font-semibold">市场怎么看你</h2>
            <p className="mt-1 text-xs leading-6 text-muted-foreground">每一类投满 5 家才算比例。投出去 21 天状态都没变，算没回音。</p>
            <div className="mt-4">
              <MarketTable rows={marketRows(apps, profile.categories, today)} />
            </div>
            <div className="mt-4">
              <BetForm />
            </div>
          </section>

          <section>
            <h2 className="text-base font-semibold">今天搜到的</h2>
            <div className="mt-4 space-y-4">
              <JobSearchLoader auto={profile.lastSearchOn !== today} />
              <CandidateList candidates={candidates} profile={profile} />
            </div>
          </section>

          <section>
            <h2 className="text-base font-semibold">加一个岗位</h2>
            <p className="mt-1 text-xs leading-6 text-muted-foreground">手机上刷到的，分享进材料箱，再在那份材料上点「这是岗位」。</p>
            <div className="mt-4">
              <AddPostingForm />
            </div>
          </section>

          <section>
            <h2 className="text-base font-semibold">你在看的岗位（{picked.length}）</h2>
            {picked.length === 0 ? (
              <p className="mt-2 text-sm leading-7 text-muted-foreground">这里空着。从「今天搜到的」里点「要这个」，或者自己加一个。</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {picked.map((p) => {
                  const status = statusByPosting.get(p.id);
                  return (
                    <li key={p.id} className="flex flex-wrap items-center gap-2 text-sm leading-7">
                      <Link href={`/jobs/${p.id}`} className="font-medium underline-offset-4 hover:underline">
                        {p.company_name} · {p.title}
                      </Link>
                      <Badge variant="outline">{categoryLabel(p.category)}</Badge>
                      <Badge variant="muted">{status ? EFFECTIVE_LABELS[status] : "还没投"}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </PageContainer>
  );
}
