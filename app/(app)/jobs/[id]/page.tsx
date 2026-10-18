import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { Separator } from "@/components/ui/separator";
import { getApplicationForPosting } from "@/lib/domains/jobs/applications";
import { listCareerEntries } from "@/lib/domains/jobs/base";
import { getFillState, MISSING_FILL_MIGRATION } from "@/lib/domains/jobs/fill";
import { getPosting } from "@/lib/domains/jobs/postings";
import { getJobProfile } from "@/lib/domains/jobs/profile";
import { latestResume } from "@/lib/domains/jobs/resumes";
import { atsOf, ATS_SITES, boardOf, BOARD_SITES } from "@/lib/domains/jobs/shared";
import { listCaseDrills, MISSING_CASE_MIGRATION } from "@/lib/domains/jobs/cases";
import { getHiringContext, MISSING_HIRING_MIGRATION } from "@/lib/domains/jobs/hiring";
import { latestNoticeFor } from "@/lib/domains/signals/kanpo";
import { NoticeLine } from "../../signals/kanpo/notice-line";
import { ApplicationPanel } from "./application-panel";
import { CasePanel } from "./case-panel";
import { FillPanel } from "./fill-panel";
import { HiringPanel } from "./hiring-panel";
import { MatchView } from "./match-view";
import { PostingFacts } from "./posting-facts";
import { ResumePanel } from "./resume-panel";

export const dynamic = "force-dynamic";
// 对照、改简历都是这一页的 server action，改简历要二三十秒
export const maxDuration = 60;

const SOURCE_LABELS = { share: "手机分享", search: "每天搜到", manual: "你手动加的", email: "邮件" } as const;

export default async function JobPostingPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();

  const posting = await getPosting(user.id, params.id);
  if (!posting) notFound();
  const [profile, entries, resume, application, fill, cases, kanpo, hiring] = await Promise.all([
    getJobProfile(user.id),
    listCareerEntries(user.id),
    latestResume(user.id, posting.id),
    getApplicationForPosting(user.id, posting.id),
    getFillState(user.id, posting.id),
    listCaseDrills(user.id, posting.id),
    latestNoticeFor(posting.company_name),
    getHiringContext(user.id, posting.id).catch(() => null),
  ]);
  const confirmed = entries === "missing-schema" ? [] : entries.filter((e) => e.confirmed_at);
  const ats = atsOf(posting.url);
  const board = boardOf(posting.url);

  return (
    <PageContainer>
      <p className="mb-4 text-sm">
        <Link href="/jobs" className="text-muted-foreground transition-colors duration-150 hover:text-foreground">
          ← 求职
        </Link>
      </p>
      <PageHeader
        eyebrow={SOURCE_LABELS[posting.source]}
        title={posting.title}
        description={
          <>
            {posting.company_id ? (
              <Link href={`/companies/${posting.company_id}`} className="underline-offset-4 hover:underline">
                {posting.company_name}
              </Link>
            ) : (
              posting.company_name
            )}
            {posting.url && (
              <>
                {" · "}
                <a href={posting.url} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
                  原页面
                </a>
              </>
            )}
          </>
        }
      />
      <div className="space-y-10">
        <div className="space-y-2">
          <PostingFacts posting={posting} profile={profile === "missing-schema" ? null : profile} />
          {kanpo && (
            <p className="text-xs leading-6">
              <span className="text-muted-foreground">官报决算：</span>
              <NoticeLine notice={kanpo} />
              <span className="ml-1 text-muted-foreground">（只查得到在官报登过、最近抓到的；查不到不代表没登）</span>
            </p>
          )}
        </div>
        <Separator />
        <HiringPanel
          postingId={posting.id}
          context={hiring === "missing-schema" ? null : hiring}
          missingMigration={hiring === "missing-schema" ? MISSING_HIRING_MIGRATION : null}
        />
        <Separator />
        <MatchView posting={posting} entries={confirmed} />
        <Separator />
        <ResumePanel postingId={posting.id} resume={resume} hasEntries={confirmed.length > 0} />
        <Separator />
        <CasePanel
          postingId={posting.id}
          drills={cases === "missing-schema" ? [] : cases}
          missingMigration={cases === "missing-schema" ? MISSING_CASE_MIGRATION : null}
        />
        <Separator />
        <FillPanel
          postingId={posting.id}
          hasUrl={!!posting.url}
          atsLabel={ats ? ATS_SITES[ats].label : null}
          boardLabel={board ? BOARD_SITES[board].label : null}
          state={fill === "missing-schema" ? null : fill}
          missingMigration={fill === "missing-schema" ? MISSING_FILL_MIGRATION : null}
        />
        <Separator />
        <ApplicationPanel
          postingId={posting.id}
          resumeId={resume?.id ?? null}
          application={application}
          defaultChannel={ats ? "site" : "board"}
        />
      </div>
    </PageContainer>
  );
}
