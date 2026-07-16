import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRetroPeriod, listJudgmentRules } from "../../queries";
import { MonthlyRetrospectiveWorkspace } from "./workspace";

export const dynamic = "force-dynamic";

export default async function MonthlyRetrospectivePage({
  params,
}: {
  params: { period: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [period, rules] = await Promise.all([
    getRetroPeriod(params.period, user!.id),
    listJudgmentRules(user!.id),
  ]);
  if (!period || period.period_type !== "monthly") notFound();
  return (
    <>
      <MonthlyRetrospectiveWorkspace
        initialPeriod={period}
        activeRules={rules.filter(
          (rule) => rule.status === "active" || period.status === "completed"
        )}
      />
    </>
  );
}
