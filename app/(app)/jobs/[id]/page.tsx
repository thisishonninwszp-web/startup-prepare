import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { Separator } from "@/components/ui/separator";
import { getApplicationForPosting } from "@/lib/domains/jobs/applications";
import { listCareerEntries } from "@/lib/domains/jobs/base";
import { getPosting } from "@/lib/domains/jobs/postings";
import { getJobProfile } from "@/lib/domains/jobs/profile";
import { latestResume } from "@/lib/domains/jobs/resumes";
import { ApplicationPanel } from "./application-panel";
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
  const [profile, entries, resume, application] = await Promise.all([
    getJobProfile(user.id),
    listCareerEntries(user.id),
    latestResume(user.id, posting.id),
    getApplicationForPosting(user.id, posting.id),
  ]);
  const confirmed = entries === "missing-schema" ? [] : entries.filter((e) => e.confirmed_at);

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
        <PostingFacts posting={posting} profile={profile === "missing-schema" ? null : profile} />
        <Separator />
        <MatchView posting={posting} entries={confirmed} />
        <Separator />
        <ResumePanel postingId={posting.id} resume={resume} hasEntries={confirmed.length > 0} />
        <Separator />
        <ApplicationPanel postingId={posting.id} resumeId={resume?.id ?? null} application={application} />
      </div>
    </PageContainer>
  );
}
