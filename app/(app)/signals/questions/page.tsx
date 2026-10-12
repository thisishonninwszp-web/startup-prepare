import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { formatTokyoTime } from "@/lib/domains/signals/format";
import { listQuestions } from "@/lib/domains/signals/questions";
import { CreateQuestionForm } from "./question-forms";

export const dynamic = "force-dynamic";

export default async function QuestionsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const questions = await listQuestions(user.id);

  return (
    <PageContainer width="narrow">
      <p className="mb-4 text-sm">
        <Link href="/signals" className="text-muted-foreground transition-colors duration-150 hover:text-foreground">
          ← 今日报告
        </Link>
      </p>
      <PageHeader
        eyebrow="Questions"
        title="我在追的问题"
        description="每日报告是报告问你，这里是你问报告。手上留几个想一直追下去的问题，AI 把它拆开、分头上网查；你隔几天看一次，更新自己的看法，每周挑一个写成一篇。"
      />

      {questions === "missing-schema" ? (
        <div className="rounded-lg border border-status-validating/30 bg-status-validating/10 p-5 text-sm leading-7 text-status-validating">
          数据库还差一步：迁移 059 没跑。执行 supabase/migrations/059_signal_questions.sql 之后再来。
        </div>
      ) : (
        <>
          <section className="mb-10 rounded-lg border border-border bg-card p-4">
            <h2 className="mb-3 text-base font-semibold">提一个新问题</h2>
            <CreateQuestionForm />
          </section>

          {questions.length === 0 ? (
            <EmptyState
              title="这里空着。"
              description="还没有在追的问题。三个就够，多了追不过来。"
            />
          ) : (
            <ul className="space-y-4">
              {questions.map((q) => (
                <li key={q.id}>
                  <Link
                    href={`/signals/questions/${q.id}`}
                    className="block rounded-lg border border-border bg-card p-4 transition-colors duration-150 hover:border-primary/40"
                  >
                    <p className="text-base font-semibold leading-7">{q.question}</p>
                    <p className="mt-1 text-sm leading-7">
                      <span className="text-muted-foreground">你现在的看法：</span>
                      {q.views[0]?.view ?? "还没写"}
                    </p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      {q.researched_at ? `上次查：${formatTokyoTime(q.researched_at)}` : "还没查过"}
                      {q.views.length > 1 ? ` · 看法改过 ${q.views.length - 1} 次` : ""}
                      {q.research?.freshCount ? ` · 新冒出来 ${q.research.freshCount} 条证据` : ""}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </PageContainer>
  );
}
