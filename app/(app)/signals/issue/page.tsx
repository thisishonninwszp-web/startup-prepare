import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { tokyoToday } from "@/lib/domains/signals/brief";
import { getIssue, issueCandidates, issueCounts, listIssues, weekStartOf } from "@/lib/domains/signals/issue";
import { IssueComposer } from "./issue-composer";

export const dynamic = "force-dynamic";
// 生成四个版本要二三十秒，由这一页的 server action 跑
export const maxDuration = 60;

export default async function IssuePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const weekStart = weekStartOf(tokyoToday());
  const [current, candidates, past] = await Promise.all([getIssue(user.id, weekStart), issueCandidates(user.id), listIssues(user.id)]);
  const earlier = past.filter((p) => p.week_start !== weekStart);

  return (
    <PageContainer width="narrow">
      <p className="mb-4 text-sm">
        <Link href="/signals/gaps" className="text-muted-foreground transition-colors duration-150 hover:text-foreground">
          ← 差距清单
        </Link>
      </p>
      <PageHeader
        eyebrow="Weekly"
        title="周刊"
        description="朋友圈小，就写出来让陌生人找上门。每周一期「那边有、这边还没有」：挑几条核实过的，每条写一句你自己的判断，再公开对账押过的。系统排成中文长文、小红书、日文 note、日文 X 四个版本，你复制去发。前两三个月多半没人来，靠的是每周不断。"
      />

      {current === "missing-schema" ? (
        <p className="text-sm leading-7 text-muted-foreground">
          还差一步：迁移 071 没跑。执行 supabase/migrations/071_signal_issues.sql 之后再来。
        </p>
      ) : (
        <>
          <p className="mb-6 font-mono text-xs text-muted-foreground">这一期：{weekStart} 这一周</p>
          <IssueComposer weekStart={weekStart} gaps={candidates.gaps} bets={candidates.bets} initial={current} />
        </>
      )}

      {earlier.length > 0 && (
        <section className="mt-12 border-t pt-6">
          <h2 className="text-base font-semibold">以前的 {earlier.length} 期</h2>
          <ul className="mt-3 space-y-1 font-mono text-xs text-muted-foreground">
            {earlier.map((p) => {
              const c = issueCounts(p);
              return (
                <li key={p.id}>
                  {p.week_start} · 写了 {p.content.picks.length} 条 · 发了 {c.published} 处 · 回应 {c.responses} 条 · 想聊 {c.wantsTalk} 位
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </PageContainer>
  );
}
