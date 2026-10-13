import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { listAnsweredDrills, nextDrill, tallyDrills } from "@/lib/domains/signals/drills";
import { DrillCard, DrillReveal, GenerateDrillsButton } from "./drill-card";

export const dynamic = "force-dynamic";
// 出一批题要三四十秒，由这一页的 server action 跑
export const maxDuration = 60;

/** 攒够几道再看把握准不准。 */
const ENOUGH_DRILLS = 20;
/** 下面列出最近答过的几道。 */
const RECENT = 10;

export default async function DrillPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const [open, answered] = await Promise.all([nextDrill(user.id), listAnsweredDrills(user.id)]);
  const tally = tallyDrills(answered);

  return (
    <PageContainer width="narrow">
      <p className="mb-4 text-sm">
        <Link href="/signals/practice" className="text-muted-foreground transition-colors duration-150 hover:text-foreground">
          ← 判断账本
        </Link>
      </p>
      <PageHeader
        eyebrow="Drill"
        title="历史题"
        description="真实的判断要等几个月才对账，反馈太慢。这里是过去真实发生过、结果早就揭晓的事：只给你当时知道的，猜会不会，答完马上揭晓。题目挑的是和你最近在看的新闻像的事；答案上网核实过，没核实到出处的不出。对错由代码比，不用你自己判。"
      />

      {open === "missing-schema" ? (
        <p className="text-sm leading-7 text-muted-foreground">
          还差一步：迁移 066 没跑。执行 supabase/migrations/066_signal_drills.sql 之后再来。
        </p>
      ) : open ? (
        <DrillCard key={open.id} drill={open} />
      ) : (
        <div>
          <p className="mb-3 text-sm leading-7 text-muted-foreground">
            {answered.length === 0 ? "还没做过。" : "攒下的题都做完了。"}出一批要三四十秒：先出三道，再上网核实答案，核实不到的扔掉。
          </p>
          <GenerateDrillsButton />
        </div>
      )}

      {tally.total > 0 && (
        <section className="mt-12 border-t pt-6">
          <h2 className="text-base font-semibold">
            做了 {tally.total} 道，猜对 {tally.hit} 道
          </h2>
          <ul className="mt-3 space-y-1 text-sm">
            {tally.byConfidence
              .filter((c) => c.total > 0)
              .map((c) => (
                <li key={c.key}>
                  说「{c.label}」的 <span className="font-mono">{c.total}</span> 道里，猜对 <span className="font-mono">{c.hit}</span> 道
                </li>
              ))}
          </ul>
          <p className="mt-2 text-xs leading-6 text-muted-foreground">
            {tally.total < ENOUGH_DRILLS
              ? `才 ${tally.total} 道，看不出什么。攒到 ${ENOUGH_DRILLS} 道以上再看下面这件事。`
              : ""}
            说「很有把握」的那一行，猜对的应该明显多于「没什么把握」那一行；差不多的话，说明你的把握感还不太靠得住 —— 这正是要练的。
          </p>

          <details className="mt-6">
            <summary className="cursor-pointer text-sm text-muted-foreground">最近答过的 {Math.min(RECENT, answered.length)} 道</summary>
            <ul className="mt-4 space-y-6">
              {answered.slice(0, RECENT).map((d) => (
                <li key={d.id}>
                  <p className="text-sm leading-7 text-muted-foreground">{d.setup}</p>
                  <p className="mt-1 text-sm font-medium leading-7">{d.question}</p>
                  {d.reasoning && <p className="mt-1 text-xs text-muted-foreground">你当时的理由：{d.reasoning}</p>}
                  <DrillReveal drill={d} />
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}
    </PageContainer>
  );
}
