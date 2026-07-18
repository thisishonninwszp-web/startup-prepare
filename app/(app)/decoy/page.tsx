import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/page-container";
import { getDecoySession, listDecoySessions } from "./queries";
import { DEFAULT_DECOY_STYLE, type DecoyPlanPublic, type DecoySessionRow } from "./types";
import { NewDecoyForm } from "./new-decoy-form";
import { DecoyFlow, type DecoySessionForClient } from "./decoy-flow";

export const dynamic = "force-dynamic";

/** 揭底前绝不把 planted_flaws 送到客户端。 */
function toClientSession(row: DecoySessionRow): DecoySessionForClient {
  const revealed = row.status !== "drafted" && row.status !== "challenged";
  const planPublic: DecoyPlanPublic = { sections: row.plan.sections };
  return {
    id: row.id,
    problem: row.problem,
    plan: planPublic,
    planted_flaws: revealed ? row.plan.planted_flaws : null,
    challenges: row.challenges,
    reveal: row.reveal,
    own_plan: row.own_plan,
    own_plan_critique: row.own_plan_critique,
    final_plan: row.final_plan,
    learned: row.learned,
    status: row.status,
    style: row.plan.style ?? DEFAULT_DECOY_STYLE,
  };
}

export default async function DecoyPage({
  searchParams,
}: {
  searchParams: { session?: string; ideaId?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user!.id;

  const activeRow = searchParams.session
    ? await getDecoySession(searchParams.session, userId)
    : null;
  const history = await listDecoySessions(userId);

  return (
    <PageContainer width="narrow" className="animate-fade-up">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">假方案</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          没思路的时候，先别等答案。AI 给你一份看似正确、实则埋了雷的方案——
          找出它的错漏，然后写下你自己的方案。你的方案才是这次练习的产物。
        </p>
      </header>

      {activeRow ? (
        <DecoyFlow session={toClientSession(activeRow)} />
      ) : (
        <NewDecoyForm ideaId={searchParams.ideaId ?? null} />
      )}

      {history.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            过往练习
          </h2>
          <ul className="space-y-2">
            {history.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/decoy?session=${s.id}`}
                  className="block rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-muted"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate text-sm font-medium">
                      {s.own_plan ? s.own_plan.slice(0, 60) : s.problem.slice(0, 60)}
                    </p>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {new Date(s.created_at).toLocaleDateString("zh-CN")}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {s.own_plan ? `问题：${s.problem.slice(0, 40)}` : "还没写下自己的方案"}
                    {s.status !== "concluded" && " · 进行中"}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </PageContainer>
  );
}
