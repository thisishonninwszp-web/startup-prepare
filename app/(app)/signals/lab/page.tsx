import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import {
  DISPLAY_LETTERS,
  LAB_VARIANT_LABELS,
  listLabRuns,
  pickOverlap,
  tallyLab,
  type LabRun,
} from "@/lib/domains/signals/lab";
import { formatReportDate } from "@/lib/domains/signals/format";
import { tokyoToday } from "@/lib/domains/signals/brief";
import { ChooseButton, RunLabButton } from "./lab-controls";

export const dynamic = "force-dynamic";
// 测一次三四十秒，由这一页的 server action 跑
export const maxDuration = 60;

/** 测够几次再下结论：太少的话，选中几次多半是运气。 */
const ENOUGH_RUNS = 5;

function RunView({ run }: { run: LabRun }) {
  const overlap = pickOverlap(run.variants);
  const byKey = new Map(run.variants.map((v) => [v.key, v]));
  const revealed = run.chosen !== null;
  return (
    <div className="space-y-6">
      {run.display.map((key, i) => {
        const v = byKey.get(key);
        const letter = DISPLAY_LETTERS[i];
        const mine = run.chosen === key;
        return (
          <section key={key} className={"rounded-lg border bg-card p-4 " + (mine ? "border-primary" : "border-border")}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="text-base font-semibold">{letter}</h3>
              {revealed && <span className="text-sm">{LAB_VARIANT_LABELS[key].name}</span>}
              {mine && <span className="text-xs text-primary">你选的</span>}
            </div>
            {revealed && <p className="mt-1 text-xs leading-6 text-muted-foreground">{LAB_VARIANT_LABELS[key].how}</p>}
            {!v || v.picks.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">这一组这次没挑出来{v?.error ? `：${v.error}` : "。"}</p>
            ) : (
              <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm leading-7">
                {v.picks.map((p) => (
                  <li key={p.signal_id}>
                    {p.url ? (
                      <a href={p.url} target="_blank" rel="noopener noreferrer" className="transition-colors duration-150 hover:text-primary">
                        {p.title}
                      </a>
                    ) : (
                      p.title
                    )}
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      {p.source}
                      {(overlap.get(p.signal_id) ?? 0) === 1 ? " · 只有这一组挑了" : ""}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {!revealed && v && v.picks.length > 0 && (
              <div className="mt-3">
                <ChooseButton runId={run.id} variant={key} letter={letter} />
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

export default async function SelectionLabPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const runs = await listLabRuns(user.id);
  const latest = runs?.[0] ?? null;
  const decided = (runs ?? []).filter((r) => r.chosen !== null);
  const tally = tallyLab(decided);

  return (
    <PageContainer width="narrow">
      <p className="mb-4 text-sm">
        <Link href="/signals/sources" className="text-muted-foreground transition-colors duration-150 hover:text-foreground">
          ← 信息源体检
        </Link>
      </p>
      <PageHeader
        eyebrow="Lab"
        title="挑法盲测"
        description="每天的报告从几十条候选里挑 5 条，挑的时候只看了标题和一两句简介。这里拿「今天的世界」同一批候选，用四种挑法各挑一遍，隐去是哪种。你挑最想读的那一组，挑完揭晓。测个五六次，看哪种总被你选中，再把每天的报告换成它。"
      />

      {runs === null ? (
        <p className="text-sm leading-7 text-muted-foreground">
          还差一步：迁移 065 没跑。执行 supabase/migrations/065_signal_lab.sql 之后再来。
        </p>
      ) : (
        <>
          {latest && latest.chosen === null ? (
            <>
              <p className="mb-4 text-sm leading-7 text-muted-foreground">
                {formatReportDate(tokyoToday(new Date(latest.created_at)))}这一批。只看标题，挑你最想点开读的那一组 —— 不用管哪组像哪种挑法。
                标着「只有这一组挑了」的，是几组分歧所在。
              </p>
              <RunView run={latest} />
            </>
          ) : (
            <>
              <div className="mb-8">
                <RunLabButton label={latest ? "拿今天的候选再测一次" : "拿今天的候选测第一次"} />
                <p className="mt-2 text-xs leading-6 text-muted-foreground">
                  测一次：五次 AI 调用（其中一次是更贵的模型），读十几篇网页，不用搜索额度。
                </p>
              </div>
              {latest && (
                <>
                  <h2 className="mb-3 text-base font-semibold">上一次（已揭晓）</h2>
                  <RunView run={latest} />
                </>
              )}
            </>
          )}

          {decided.length > 0 && (
            <section className="mt-12 border-t pt-6">
              <h2 className="text-base font-semibold">到现在测了 {decided.length} 次</h2>
              <ul className="mt-3 space-y-1 text-sm">
                {tally.map((t) => (
                  <li key={t.key}>
                    {LAB_VARIANT_LABELS[t.key].name}：<span className="font-mono">{t.chosen}</span> 次被你选中
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs leading-6 text-muted-foreground">
                {decided.length < ENOUGH_RUNS
                  ? `才 ${decided.length} 次，谁多一次两次多半是运气。测到 ${ENOUGH_RUNS} 次以上再定。`
                  : "够几次了。哪种一直被选中，告诉我，把每天的报告换成它；如果是「现在的挑法」，那就是不用换。"}
              </p>
            </section>
          )}
        </>
      )}
    </PageContainer>
  );
}
