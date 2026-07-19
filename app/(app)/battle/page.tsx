import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/page-container";
import { getBattleSession, listBattleSessions } from "./queries";
import type { BattleMessage, BattleSessionRow } from "./types";
import { NewBattleForm } from "./new-battle-form";
import { BattleArena, type BattleForClient } from "./battle-arena";

export const dynamic = "force-dynamic";

/** active 状态下绝不把谬误账本送到客户端。 */
function toClientBattle(row: BattleSessionRow): BattleForClient {
  const concluded = row.status === "concluded";
  const messages: BattleMessage[] = row.messages.map((m) =>
    m.role === "demon" && !concluded ? { ...m, fallacies: undefined } : m
  );
  return {
    id: row.id,
    claim: row.claim,
    messages,
    recap: row.recap,
    final_position: row.final_position,
    learned: row.learned,
    status: row.status,
  };
}

export default async function BattlePage({
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
    ? await getBattleSession(searchParams.session, userId)
    : null;
  const history = await listBattleSessions(userId);

  return (
    <PageContainer width="narrow" className="animate-fade-up">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">心魔</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          写下一个你心动、想信的主张。AI 扮演你心里护盘的那个声音——它会抵赖、换借口。
          你的任务是把它的逻辑漏洞一个个钉死，直到它词穷。
        </p>
      </header>

      {activeRow ? (
        <BattleArena battle={toClientBattle(activeRow)} />
      ) : (
        <NewBattleForm ideaId={searchParams.ideaId ?? null} />
      )}

      {history.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            过往对战
          </h2>
          <ul className="space-y-2">
            {history.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/battle?session=${s.id}`}
                  className="block rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-muted"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate text-sm font-medium">
                      {s.final_position
                        ? s.final_position.slice(0, 60)
                        : s.claim.slice(0, 60)}
                    </p>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {new Date(s.created_at).toLocaleDateString("zh-CN")}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {s.final_position
                      ? `主张：${s.claim.slice(0, 40)}`
                      : s.status === "active"
                        ? "对战进行中"
                        : "已结束，还没写下你的立场"}
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
