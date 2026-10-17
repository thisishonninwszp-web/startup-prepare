import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { CASE_TYPES, minutesTaken } from "@/lib/domains/jobs/case-shared";
import { getCaseDrill, MISSING_CASE_MIGRATION } from "@/lib/domains/jobs/cases";
import { AnswerForm } from "./answer-form";
import { FollowupForm } from "./followup-form";
import { StuckPicker } from "./stuck-picker";

export const dynamic = "force-dynamic";
// 交结构、回答追问都在这一页的 server action 里调 AI，各要十几到三十秒
export const maxDuration = 60;

export default async function CaseDrillPage({ params }: { params: { cid: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();
  if (!/^[0-9a-f-]{36}$/i.test(params.cid)) notFound();

  const found = await getCaseDrill(user.id, params.cid);
  if (found === "missing-schema") {
    return (
      <PageContainer width="narrow">
        <PageHeader title="练 case" />
        <p className="text-sm leading-7 text-muted-foreground">{MISSING_CASE_MIGRATION}</p>
      </PageContainer>
    );
  }
  if (!found) notFound();
  const { drill, posting } = found;
  const q = drill.question;
  const minutes = minutesTaken(drill.started_at, drill.answered_at);

  return (
    <PageContainer width="narrow">
      <p className="mb-4 text-sm">
        <Link href={`/jobs/${drill.posting_id}`} className="text-muted-foreground transition-colors duration-150 hover:text-foreground">
          ← {posting ? `${posting.company_name} · ${posting.title}` : "岗位"}
        </Link>
      </p>
      <PageHeader eyebrow={`练 case · ${CASE_TYPES[q.type]}`} title={q.prompt_ja} description={q.premise_ja} />
      <div className="space-y-10 text-sm leading-7">
        <p className="text-muted-foreground">
          为什么出这道：{q.why}
          <br />
          <span className="text-xs">招聘页原话：「{q.quote}」</span>
        </p>

        {drill.status === "asked" && <AnswerForm id={drill.id} startedAt={drill.started_at} />}

        {drill.answer && (
          <section>
            <h2 className="text-base font-semibold">
              你写的结构
              {minutes !== null && <span className="ml-2 text-xs font-normal text-muted-foreground">用了 {minutes} 分钟</span>}
            </h2>
            <p className="mt-2 whitespace-pre-wrap" lang="ja">
              {drill.answer}
            </p>
          </section>
        )}

        {drill.status === "answered" && drill.followups && <FollowupForm id={drill.id} followups={drill.followups} />}

        {drill.status === "reviewed" && drill.followups && drill.review && (
          <>
            <section>
              <h2 className="text-base font-semibold">面试官追问</h2>
              <ol className="mt-2 space-y-4">
                {drill.followups.map((f, i) => (
                  <li key={i}>
                    <p className="font-medium" lang="ja">
                      {f.q_ja}
                    </p>
                    <p className="text-xs text-muted-foreground">针对你写的：「{f.cites}」</p>
                    <p className="mt-1 whitespace-pre-wrap" lang="ja">
                      {f.a || "（没答）"}
                    </p>
                  </li>
                ))}
              </ol>
            </section>

            <section>
              <h2 className="text-base font-semibold">复盘</h2>
              <p className="mt-1 text-xs text-muted-foreground">参考结构是 AI 写的一种拆法，不是标准答案。</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5" lang="ja">
                {drill.review.reference_ja.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ol>
              <h3 className="mt-6 font-medium">最容易被追问穿的地方</h3>
              <ul className="mt-2 space-y-3">
                {drill.review.weak.map((w, i) => (
                  <li key={i}>
                    <p className="text-xs text-muted-foreground">你写的：「{w.quote}」</p>
                    <p>{w.why}</p>
                  </li>
                ))}
              </ul>
            </section>

            <StuckPicker id={drill.id} suggested={drill.review.suggested_step} current={drill.stuck_step} />
          </>
        )}
      </div>
    </PageContainer>
  );
}
