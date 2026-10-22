import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { tokyoToday } from "@/lib/domains/signals/brief";
import { policySummary } from "@/lib/domains/signals/policy";
import { POLICY_MIN_HISTORY, type LagSummary } from "@/lib/domains/signals/policy-shared";
import { loadForecastBoard } from "@/lib/domains/signals/forecast";

export const dynamic = "force-dynamic";

function LagLine({ s, unit }: { s: LagSummary; unit: string }) {
  if (s.n === 0) return <span className="text-muted-foreground">还没有</span>;
  return (
    <span>
      {s.n} {unit}，中位 <span className="font-mono">{s.median}</span> 天：当天 {s.same} · 半年内 {s.within6m} · 一年内 {s.within1y} · 更久 {s.longer}
    </span>
  );
}

/**
 * 日本政策的「流水线」（迁移 097）：征求意见 → 公布 → 施行，各段一般隔多久由代码从历史数出来；
 * 跟他的方向有关、正在征求意见的，列出来，按历史大概什么时候公布。
 */
export default async function PolicyPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const today = tokyoToday();
  const [summary, board] = await Promise.all([
    policySummary(today).catch((e) => {
      console.error("policy summary", e);
      return null;
    }),
    loadForecastBoard(user.id).catch(() => "missing-schema" as const),
  ]);
  const questions = board === "missing-schema" ? [] : board.questions.filter((q) => q.kind === "policy" && q.status === "open");

  return (
    <PageContainer width="narrow">
      <PageHeader
        eyebrow="Policy pipeline"
        title="政策流水线"
        description="日本的规则走很固定的流程：征求意见（パブコメ）→ 公布 → 施行。各段一般隔多久，从 e-Gov 的历史数据直接数出来 —— 在这种事上，一个简单的统计比任何人的意见都准。跟你的方向有关的（外国人、劳动、护理、民宿、支付、运输、餐饮、个人信息、电商……）单独列出来。"
      />

      {summary === null ? (
        <p className="text-sm leading-7 text-muted-foreground">还差一步：迁移 097 没跑。执行 supabase/migrations/097_signal_policy.sql 之后，后台每天早晚抓 e-Gov 的意见征集，一个月刷新一次法律的修改历史。</p>
      ) : (
        <>
          <section className="mb-10">
            <h2 className="mb-1 text-base font-semibold">正在征求意见、跟你有关的</h2>
            {summary.open.length === 0 ? (
              <p className="text-sm leading-7 text-muted-foreground">这会儿没有。后台每天早晚各抓一次 e-Gov 的订阅。</p>
            ) : (
              <ul className="space-y-2">
                {summary.open.map((i) => (
                  <li key={i.id} className="text-sm leading-7">
                    <a href={i.url} target="_blank" rel="noreferrer" className="transition-colors duration-150 hover:text-primary">
                      {i.title}
                    </a>
                    <span className="block font-mono text-xs text-muted-foreground">
                      {i.ministry ?? ""} · 意见截止 {i.deadline ?? "—"}
                      {summary.deadlineToPromulgate.median !== null && i.deadline ? ` · 按历史中位数，大约 ${new Date(Date.parse(`${i.deadline}T00:00:00Z`) + summary.deadlineToPromulgate.median * 86_400_000).toISOString().slice(0, 10)} 前后公布` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mb-10">
            <h2 className="mb-1 text-base font-semibold">基准</h2>
            <ul className="space-y-1 text-sm leading-7">
              <li>
                <span className="text-muted-foreground">意见截止 → 公布：</span>
                <LagLine s={summary.deadlineToPromulgate} unit="件" />
                {summary.deadlineToPromulgate.n < POLICY_MIN_HISTORY && (
                  <span className="text-xs text-muted-foreground">（从开始记录起攒，满 {POLICY_MIN_HISTORY} 件才出政策题）</span>
                )}
              </li>
              <li>
                <span className="text-muted-foreground">法律修改 公布 → 施行（{summary.laws.length} 部，2005 年以后）：</span>
                <LagLine s={summary.allLaws} unit="次" />
              </li>
            </ul>
            {summary.laws.length > 0 && (
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer text-muted-foreground">每部法律各自的</summary>
                <ul className="mt-2 space-y-1">
                  {summary.laws.map((l) => (
                    <li key={l.title} className="leading-6">
                      <span className="mr-2">{l.title}</span>
                      <LagLine s={l.summary} unit="次" />
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <p className="mt-2 text-xs leading-6 text-muted-foreground">
              只数次数和天数。「截止 → 公布」只算有结果、写了公布日的那些（从没公布的不在里面，所以偏乐观）；同一次修改分几步施行的，每一步算一次。
            </p>
          </section>

          {summary.recent.length > 0 && (
            <section className="mb-10">
              <h2 className="mb-1 text-base font-semibold">最近有结果的（跟你有关的）</h2>
              <ul className="space-y-2">
                {summary.recent.map((i) => (
                  <li key={i.id} className="text-sm leading-7">
                    <a href={i.url} target="_blank" rel="noreferrer" className="transition-colors duration-150 hover:text-primary">
                      {i.title}
                    </a>
                    <span className="block font-mono text-xs text-muted-foreground">
                      {i.ministry ?? ""} · 截止 {i.deadline ?? "—"} → 结果 {i.result_date ?? "—"}
                      {i.promulgate_date ? ` · 公布 ${i.promulgate_date}` : ""}
                      {i.comments !== null ? ` · 意见 ${i.comments} 条` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h2 className="mb-1 text-base font-semibold">政策题</h2>
            <p className="mb-2 text-xs leading-6 text-muted-foreground">
              正在征求意见、跟你有关的，每天出一道「会不会在某天之前公布」：门槛日取历史中位数，统计基准跟 AI、你一起记分，到期由代码按 e-Gov 的公布日对账。
            </p>
            {questions.length === 0 ? (
              <p className="text-sm leading-7 text-muted-foreground">还没有（历史攒够 {POLICY_MIN_HISTORY} 件以后开始出）。</p>
            ) : (
              <ul className="space-y-1">
                {questions.map((q) => (
                  <li key={q.id} className="text-sm leading-7">
                    {q.title}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-sm">
              <Link href="/signals/forecast" className="text-primary underline-offset-4 hover:underline">
                去预测页判断 →
              </Link>
            </p>
          </section>
        </>
      )}
    </PageContainer>
  );
}
