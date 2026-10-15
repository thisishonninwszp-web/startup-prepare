import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import {
  ATLAS_CARRIERS,
  ATLAS_CATEGORIES,
  ATLAS_OUTCOMES,
  baseSentence,
  categoryBase,
  CLAIM_LABELS,
  countedCases,
  lagLabel,
  listTransferCases,
  missingSeeds,
  OUTCOME_DEFINITIONS,
  type AtlasOutcome,
  type AtlasCategory,
  type TransferCase,
} from "@/lib/domains/signals/atlas";
import { OutcomeEditor, RejudgeButton, ResearchAtlasButton } from "./atlas-controls";

export const dynamic = "force-dynamic";
// 查一批要三四十秒，由这一页的 server action 跑
export const maxDuration = 60;

function CaseRow({ c }: { c: TransferCase }) {
  return (
    <li className="border-b border-border pb-4 last:border-b-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{c.thing}</p>
        <span className="font-mono text-xs text-muted-foreground">
          {lagLabel(c.lag_months)} · {ATLAS_OUTCOMES[c.outcome]} · {ATLAS_CARRIERS[c.carrier]}
          {c.found_via === "recheck" ? " · 来自你的清单" : ""}
        </span>
      </div>
      <p className="mt-1 text-sm leading-7">
        <span className="text-muted-foreground">{c.origin === "china" ? "中国" : "美国"}（{c.origin_date}）：</span>
        {c.origin_event}
      </p>
      <p className="text-sm leading-7">
        <span className="text-muted-foreground">日本{c.japan_date ? `（${c.japan_date}）` : ""}：</span>
        {c.japan_event ?? "至今没有"}
      </p>
      {c.judge_status === "failed" && (
        <p className="text-xs leading-6 text-verdict-learned">没过裁判：{c.judge_note ?? "原文证明不了"} —— 先不算进统计。</p>
      )}
      {(c.judge_status === null || c.judge_status === "unavailable") && (
        <p className="text-xs leading-6 text-muted-foreground">这一件的原文还没请裁判看过{c.judge_note ? `（${c.judge_note}）` : ""}。</p>
      )}
      <OutcomeEditor id={c.id} outcome={c.outcome} />
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">原文（{c.sources.length} 处）</summary>
        <ul className="mt-1 space-y-1">
          {c.sources.map((s, i) => (
            <li key={i} className="text-muted-foreground">
              {s.proves !== undefined && (
                <span className="mr-1 font-mono">[{s.proves ? `证明：${CLAIM_LABELS[s.proves]}` : "裁判看来证明不了"}]</span>
              )}
              「{s.excerpt}」
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="ml-1 text-primary underline-offset-4 hover:underline">
                {s.title || "来源"} ↗
              </a>
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}

export default async function AtlasPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const cases = await listTransferCases(user.id);

  return (
    <PageContainer width="narrow">
      <p className="mb-4 text-sm">
        <Link href="/signals/gaps" className="text-muted-foreground transition-colors duration-150 hover:text-foreground">
          ← 差距清单
        </Link>
      </p>
      <PageHeader
        eyebrow="Atlas"
        title="时差图谱"
        description="一样东西在中国、美国先有，什么时候到了日本（或没到）、结果怎样、是谁带进来的。攒起来，回答「两年内日本会不会出现」时就有同类的先例可比。每一件都上网核实三样 —— 那边什么时候有、日本什么时候有（或明确写着没有）、在日本的结果 —— 缺一样就不收。只数次数，不打分。"
      />

      {cases === "missing-schema" ? (
        <p className="text-sm leading-7 text-muted-foreground">
          还差一步：迁移 073 没跑。执行 supabase/migrations/073_signal_transfer_cases.sql 之后再来。
        </p>
      ) : (
        <>
          <div className="mb-8 space-y-3">
            <ResearchAtlasButton mode={cases.length === 0 ? "seed" : "more"} />
            {cases.some((c) => c.judge_status === null || c.judge_status === "unavailable") && (
              <RejudgeButton count={cases.filter((c) => c.judge_status === null || c.judge_status === "unavailable").length} />
            )}
            {cases.length > 0 && missingSeeds(cases).length > 0 && (
              <ResearchAtlasButton mode="seed" label={`重试没收进来的 ${missingSeeds(cases).length} 件样例（${missingSeeds(cases).join("、")}）`} />
            )}
            <p className="mt-2 text-xs leading-6 text-muted-foreground">
              {cases.length === 0
                ? "这里空着。先从十件样例开始（扫码支付、共享单车、网约车……），每件都会再上网核实一遍。"
                : "再找几件：AI 提候选（专门要退出的、被卡住的、至今没到的，只收成功的就是幸存者偏差），差距清单里重查发现「日本有了」的也一起查。"}
            </p>
          </div>

          {cases.length > 0 && (
            <>
              <section className="mb-10">
                <h2 className="text-base font-semibold">
                  按类别（算进统计的 {countedCases(cases).length} 件
                  {cases.length > countedCases(cases).length ? `，没过裁判的 ${cases.length - countedCases(cases).length} 件不算` : ""}）
                </h2>
                <ul className="mt-3 space-y-2 text-sm leading-7">
                  {(Object.keys(ATLAS_CATEGORIES) as AtlasCategory[])
                    .filter((k) => countedCases(cases).some((c) => c.category === k))
                    .map((k) => (
                      <li key={k}>{baseSentence(k, categoryBase(countedCases(cases).filter((c) => c.category === k)))}</li>
                    ))}
                </ul>
                {(() => {
                  const all = categoryBase(countedCases(cases));
                  return all.chinaCarried > 0 ? (
                    <p className="mt-3 text-xs leading-6 text-muted-foreground">
                      中国公司直接进日本的 {all.chinaCarried} 件里，退出了 {all.chinaExited} 件。谁带进来，常常比东西本身更决定结果。
                    </p>
                  ) : null;
                })()}
                <p className="mt-2 text-xs leading-6 text-muted-foreground">
                  件数少的时候别当真 —— 三五件的规律多半是巧合，攒到每类十件以上再看。
                  退出的、失败的消息比成功的难查到，最容易被「缺一样不收」刷掉；图谱看着偏乐观时，先想到这一点。
                </p>
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer text-muted-foreground">每一档是什么意思</summary>
                  <ul className="mt-1 space-y-1 leading-6 text-muted-foreground">
                    {(Object.keys(OUTCOME_DEFINITIONS) as AtlasOutcome[]).map((o) => (
                      <li key={o}>{OUTCOME_DEFINITIONS[o]}</li>
                    ))}
                    <li>说的是这样东西在日本整体的状况，不是某一家公司的结果。核实只许往更差改，不许往更「成」提。</li>
                  </ul>
                </details>
              </section>

              {(Object.keys(ATLAS_CATEGORIES) as AtlasCategory[])
                .filter((k) => cases.some((c) => c.category === k))
                .map((k) => (
                  <section key={k} className="mb-8">
                    <h3 className="mb-3 text-sm font-semibold">{ATLAS_CATEGORIES[k]}</h3>
                    <ul className="space-y-4">
                      {cases
                        .filter((c) => c.category === k)
                        .map((c) => (
                          <CaseRow key={c.id} c={c} />
                        ))}
                    </ul>
                  </section>
                ))}
            </>
          )}
        </>
      )}
    </PageContainer>
  );
}
