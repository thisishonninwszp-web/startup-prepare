import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import {
  listAnsweredDrills,
  nextDrill,
  recentDrillYield,
  tallyAnswerBalance,
  tallyDrills,
  tallyReasonJudge,
  tallyReasons,
} from "@/lib/domains/signals/drills";
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

  const [next, answered, yieldStats] = await Promise.all([nextDrill(user.id), listAnsweredDrills(user.id), recentDrillYield(user.id)]);
  const open = typeof next === "string" ? next : next.drill;
  const remaining = typeof next === "string" ? 0 : next.remaining;
  const judged = tallyReasonJudge(answered);
  const tally = tallyDrills(answered);
  const balance = tallyAnswerBalance(answered);
  const reasons = tallyReasons(answered);
  const reasonsMarked = reasons.bothRight + reasons.luckyRight + reasons.unluckyWrong + reasons.bothWrong;

  return (
    <PageContainer width="narrow">
      <PageHeader
        eyebrow="Drill"
        title="历史题"
        description="真实的判断要等几个月才对账，反馈太慢。这里是过去真实发生过、结果早就揭晓的事：只给你当时知道的，猜会不会，答完马上揭晓。题目挑的是和你最近在看的新闻像的事；答案上网核实过，没核实到出处的不出。对错由代码比，不用你自己判。"
      />

      {open === "missing-066" || open === "missing-068" ? (
        <p className="text-sm leading-7 text-muted-foreground">
          还差一步：迁移 {open === "missing-066" ? "066" : "068"} 没跑。执行 supabase/migrations/
          {open === "missing-066" ? "066_signal_drills.sql" : "068_signal_drills_criterion.sql"} 之后再来。
        </p>
      ) : open ? (
        <DrillCard key={open.id} drill={open} remaining={remaining} />
      ) : (
        <div>
          <p className="mb-3 text-sm leading-7 text-muted-foreground">
            {answered.length === 0 ? "还没做过。" : "攒下的题都做完了。"}出一批要三四十秒：先出四道，再上网核实答案，核实不到的扔掉。
          </p>
          <GenerateDrillsButton />
          {yieldStats && yieldStats.batches > 0 && tally.total === 0 && (
            <p className="mt-3 text-xs leading-6 text-muted-foreground">
              最近 {yieldStats.batches} 批：出了 {yieldStats.drafted} 道，搜到资料 {yieldStats.searched} 道，核实通过 {yieldStats.passed} 道。
            </p>
          )}
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

          {reasonsMarked > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold">结论和理由放一起看（你标过的 {reasonsMarked} 道）</h3>
              <ul className="mt-2 space-y-1 text-sm">
                <li>
                  猜对，理由也对上：<span className="font-mono">{reasons.bothRight}</span>
                </li>
                <li>
                  猜对，理由没对上（运气）：<span className="font-mono">{reasons.luckyRight}</span>
                </li>
                <li>
                  猜错，理由对上了（结果有变数）：<span className="font-mono">{reasons.unluckyWrong}</span>
                </li>
                <li>
                  猜错，理由也没对上：<span className="font-mono">{reasons.bothWrong}</span>
                </li>
              </ul>
              <p className="mt-1 text-xs leading-6 text-muted-foreground">
                「运气」那一行多，说明对的次数比你真实的判断力好看；能带到下一次判断里的，只有理由对上的那几道。
              </p>
              {judged.judged > 0 && (
                <p className="mt-1 text-xs leading-6 text-muted-foreground">
                  另一个模型单独判过的 {judged.judged} 道里：你标了对上、它看来没对上的{" "}
                  <span className="font-mono">{judged.selfYesJudgeNo}</span> 道；你标了没对上、它看来对上了的{" "}
                  <span className="font-mono">{judged.selfNoJudgeYes}</span> 道。前一种多，说明对理由时手松。
                </p>
              )}
            </div>
          )}

          <p className="mt-6 text-xs leading-6 text-muted-foreground">
            答过的题里，答案是「会」的 <span className="font-mono">{balance.answerYes}</span> 道、「不会」的{" "}
            <span className="font-mono">{balance.answerNo}</span> 道；你选「会」{" "}
            <span className="font-mono">{balance.guessYes}</span> 次、「不会」<span className="font-mono">{balance.guessNo}</span> 次。
            答案偏向一边的话，下一道会优先出另一边的；你自己选的偏向一边，可能是习惯性地往「会」或「不会」那边靠。
          </p>

          {yieldStats && yieldStats.batches > 0 && (
            <p className="mt-3 text-xs leading-6 text-muted-foreground">
              最近 {yieldStats.batches} 批：出了 <span className="font-mono">{yieldStats.drafted}</span> 道，搜到资料{" "}
              <span className="font-mono">{yieldStats.searched}</span> 道，核实通过 <span className="font-mono">{yieldStats.passed}</span> 道。
              通过的一直很少，就是出题的规矩太严了，告诉我放宽哪一条。
            </p>
          )}

          <details className="mt-6">
            <summary className="cursor-pointer text-sm text-muted-foreground">最近答过的 {Math.min(RECENT, answered.length)} 道</summary>
            <ul className="mt-4 space-y-6">
              {answered.slice(0, RECENT).map((d) => (
                <li key={d.id}>
                  <p className="text-sm leading-7 text-muted-foreground">{d.setup}</p>
                  <p className="mt-1 text-sm font-medium leading-7">{d.question}</p>
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
