import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { PrintButton } from "@/components/print-button";
import { getRetroPeriod } from "../../../queries";
import type { WeeklyRetrospective } from "../../../types";
import { PageContainer } from "@/components/ui/page-container";

export const dynamic = "force-dynamic";

const GAP_CAUSE_LABEL: Record<string, string> = {
  judgment: "判断失误",
  execution: "执行不到位",
  environment: "环境变化",
  luck: "运气",
  unknown: "尚不清楚",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function WeeklyRetroReportPage({
  params,
}: {
  params: { period: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const period = await getRetroPeriod(params.period, user.id);
  if (!period || period.period_type !== "weekly") notFound();
  if (period.status !== "completed" || !period.final) {
    return (
      <PageContainer width="narrow" className="text-sm">
        <p className="text-muted-foreground">
          这份周复盘还没有完成，暂时无法生成报告。
        </p>
        <Link
          href={`/retrospectives/weekly/${params.period}`}
          className="mt-3 inline-block text-xs text-muted-foreground hover:underline"
        >
          ← 返回周复盘
        </Link>
      </PageContainer>
    );
  }

  const final = period.final as WeeklyRetrospective;

  const [ideasResult, validationsResult, decisionsResult] = await Promise.all([
    supabaseAdmin
      .from("ideas")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", `${period.period_start}T00:00:00.000Z`)
      .lte("created_at", `${period.period_end}T23:59:59.999Z`),
    supabaseAdmin
      .from("validations")
      .select("id, ideas!inner(user_id)", { count: "exact", head: true })
      .eq("ideas.user_id", user.id)
      .gte("contacted_at", `${period.period_start}T00:00:00.000Z`)
      .lte("contacted_at", `${period.period_end}T23:59:59.999Z`),
    supabaseAdmin
      .from("decisions")
      .select("id, ideas!inner(user_id)", { count: "exact", head: true })
      .eq("ideas.user_id", user.id)
      .gte("decided_at", `${period.period_start}T00:00:00.000Z`)
      .lte("decided_at", `${period.period_end}T23:59:59.999Z`),
  ]);

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { font-size: 13px; }
          h2 { margin-top: 1.5rem; }
        }
        @page { margin: 2cm; }
      `}</style>

      <PageContainer width="narrow" className="text-sm">
        <div className="no-print mb-8 flex items-center justify-between">
          <Link
            href={`/retrospectives/weekly/${params.period}`}
            className="text-xs text-muted-foreground hover:underline"
          >
            ← 返回周复盘
          </Link>
          <PrintButton />
        </div>

        <header className="mb-8">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            周复盘报告
          </p>
          <h1 className="mt-2 text-xl font-semibold">
            {fmtDate(period.period_start)} — {fmtDate(period.period_end)}
          </h1>
        </header>

        <section className="mb-8 grid grid-cols-3 gap-3">
          <div className="rounded-md border p-3 text-center">
            <p className="text-lg font-semibold tabular-nums">
              {ideasResult.count ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">新想法</p>
          </div>
          <div className="rounded-md border p-3 text-center">
            <p className="text-lg font-semibold tabular-nums">
              {validationsResult.count ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">真实验证</p>
          </div>
          <div className="rounded-md border p-3 text-center">
            <p className="text-lg font-semibold tabular-nums">
              {decisionsResult.count ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">决策</p>
          </div>
        </section>

        <section className="mb-6">
          <h2 className="mb-2 text-sm font-medium">预期 vs 实际</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="mb-1 text-xs text-muted-foreground">预期</p>
              <ul className="space-y-1">
                {final.expected.map((s, i) => (
                  <li key={i}>· {s}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 text-xs text-muted-foreground">实际</p>
              <ul className="space-y-1">
                {final.actual.map((s, i) => (
                  <li key={i}>· {s}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {final.gaps.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-2 text-sm font-medium">落差</h2>
            <ul className="space-y-2">
              {final.gaps.map((g, i) => (
                <li key={i} className="rounded-md border p-2">
                  <span className="mr-2 rounded-full bg-muted px-2 py-0.5 text-[10px]">
                    {GAP_CAUSE_LABEL[g.cause] ?? g.cause}
                  </span>
                  {g.statement}
                </li>
              ))}
            </ul>
          </section>
        )}

        {final.hindsight_risks.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-2 text-sm font-medium">事后偏见风险</h2>
            <ul className="space-y-1">
              {final.hindsight_risks.map((s, i) => (
                <li key={i}>· {s}</li>
              ))}
            </ul>
          </section>
        )}

        {final.contradictions.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-2 text-sm font-medium">前后矛盾</h2>
            <ul className="space-y-1">
              {final.contradictions.map((s, i) => (
                <li key={i}>· {s}</li>
              ))}
            </ul>
          </section>
        )}

        <section className="mb-6">
          <h2 className="mb-2 text-sm font-medium">这周定下的规则</h2>
          <p>{final.rule}</p>
        </section>

        <section className="mb-6">
          <h2 className="mb-2 text-sm font-medium">承诺的行动</h2>
          <p>{final.commitment}</p>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-medium">下一次预测</h2>
          <p>
            {final.prediction.text}（到期：{final.prediction.due_date}）
          </p>
        </section>
      </PageContainer>
    </>
  );
}
