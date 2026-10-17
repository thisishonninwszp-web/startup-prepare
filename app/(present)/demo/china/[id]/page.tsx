import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { getChinaRun, MISSING_CHINA_MIGRATION } from "@/lib/domains/jobs/china";
import { nextChinaStep } from "@/lib/domains/jobs/china-shared";
import { ResultView } from "./result-view";
import { RunPanel } from "./run-panel";

export const dynamic = "force-dynamic";
// 第 2、3 步在这一页的 server action 里跑，各要二三十秒
export const maxDuration = 60;

export default async function ChinaRunPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();

  const run = await getChinaRun(user.id, params.id);
  if (run === "missing-schema") {
    return (
      <PageContainer>
        <p className="text-sm leading-7 text-muted-foreground">{MISSING_CHINA_MIGRATION}</p>
      </PageContainer>
    );
  }
  if (!run) notFound();

  return (
    <PageContainer>
      <p className="mb-6 text-right text-xs">
        <Link href="/demo/china" className="text-muted-foreground transition-colors duration-150 hover:text-foreground">
          別の商売で調べる
        </Link>
      </p>
      <PageHeader
        eyebrow="Demo"
        title={run.business}
        description={
          run.plan ? (
            <>
              中国での呼び方：<span lang="zh-CN">{run.plan.zh_business}</span>
              <br />
              中国語の検索語：<span lang="zh-CN">{run.plan.queries.join(" ／ ")}</span>
            </>
          ) : undefined
        }
      />
      <div className="space-y-10">
        <RunPanel id={run.id} status={run.status} step={nextChinaStep(run)} error={run.error} />
        <ResultView run={run} />
        <p className="text-xs leading-6 text-muted-foreground">
          検索で見つかったページだけを読んでいます。読めなかったページの会社は出てきません。同じ言葉で調べても、毎回少し結果が変わります。良し悪しの判断はしていません。
        </p>
      </div>
    </PageContainer>
  );
}
