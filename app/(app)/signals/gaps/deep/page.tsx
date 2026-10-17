import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { formatReportDate } from "@/lib/domains/signals/format";
import { ATLAS_OUTCOMES, baseSentence, categoryBase } from "@/lib/domains/signals/atlas-shared";
import { missingSteps } from "@/lib/domains/signals/deep-shared";
import { loadDeepPage } from "@/lib/domains/signals/deep-page";
import type { GapSide } from "@/lib/domains/signals/gaps-shared";
import { SourceCheckView } from "../../check-view";
import { NoticeLine } from "../../kanpo/notice-line";
import { TransferView } from "../transfer-view";
import { VoicesView } from "../voices-view";
import { CategoryPicker, DeepJudgment } from "./deep-judgment";
import { FillMissing } from "./fill-missing";
import { ThereView } from "./there-view";

export const dynamic = "force-dynamic";
// 「那边查一查」「把缺的都查一遍」由这一页的 server action 跑，每步三四十秒
export const maxDuration = 60;

const SIDES: GapSide[] = ["japan", "us", "china"];
const MISSING_083 = "还差一步：迁移 083 没跑。执行 supabase/migrations/083_signal_gap_deep.sql 之后，这一格才能用。";

function Section({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <section className="border-t border-border pt-6">
      <h2 className="text-base font-semibold">
        <span className="mr-2 font-mono text-sm text-muted-foreground">{n}</span>
        {title}
      </h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

export default async function DeepGapPage({ searchParams }: { searchParams: { side?: string; id?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();
  const side = SIDES.find((s) => s === searchParams.side);
  const signalId = searchParams.id ?? "";
  if (!side || !/^[0-9a-f-]{36}$/i.test(signalId)) notFound();

  const page = await loadDeepPage(user.id, side, signalId);
  const back = (
    <p className="mb-4 text-sm">
      <Link href="/signals/gaps" className="text-muted-foreground transition-colors duration-150 hover:text-foreground">
        ← 差距清单
      </Link>
    </p>
  );
  if (!page) {
    return (
      <PageContainer width="narrow">
        {back}
        <p className="text-sm leading-7 text-muted-foreground">
          这条找不到了：存下的报告里已经没有它（太久以前的会被翻过去）。回差距清单挑一条现在还在的。
        </p>
      </PageContainer>
    );
  }

  const gap = page.open ?? page.arrived!;
  const deep = page.deep === "missing-schema" ? null : page.deep;
  const steps = missingSteps({ there: page.deep === "missing-schema" || !!deep?.there, transfer: !!page.transfer, voices: !!page.voices });
  const category = deep?.category ?? null;
  const sameKind = category && page.cases ? page.cases.filter((c) => c.category === category) : [];

  return (
    <PageContainer width="narrow">
      {back}
      <PageHeader
        eyebrow="One gap, in depth"
        title={gap.headline}
        description={`${page.there}有、${page.here}还没有 · ${formatReportDate(gap.brief_date)} · ${gap.source}。这一条能查的都摆在这一页：缺的点一下就查，查完写判断，再拿去写一期。`}
      />
      <div className="space-y-8">
        <FillMissing signalId={signalId} side={side} steps={steps} />

        <Section n="①" title={`${page.there}那边是怎么回事`}>
          <p className="text-sm leading-7">{gap.background}</p>
          {gap.basis && gap.basis.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">报告里核对过的原文</summary>
              <ul className="mt-1 space-y-1 text-muted-foreground">
                {gap.basis.map((b, i) => (
                  <li key={i}>「{b}」</li>
                ))}
              </ul>
            </details>
          )}
          {gap.url && (
            <a href={gap.url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline-offset-4 hover:underline">
              原文 ↗
            </a>
          )}
          <ThereView
            signalId={signalId}
            side={side}
            there={page.there}
            initial={deep?.there ?? null}
            disabled={page.deep === "missing-schema" ? MISSING_083 : undefined}
          />
        </Section>

        <Section n="②" title={`${page.here}这边现在怎样`}>
          {page.arrived ? (
            <>
              <p className="text-sm leading-7">
                <span className="text-muted-foreground">{formatReportDate(page.arrived.arrivedOn)}重查发现这边有了：</span>
                {page.arrived.now}
              </p>
              <SourceCheckView
                check={page.arrived.nowCheck ?? undefined}
                searchQuery={`${page.here} ${gap.headline}`}
                unverifiedText="没查到出处。"
                uncheckedText="没上网查过。"
              />
              <p className="text-xs leading-6 text-muted-foreground">进清单时查过是：{gap.japan}</p>
            </>
          ) : (
            <>
              <p className="text-sm leading-7">{gap.japan}</p>
              <SourceCheckView
                check={gap.check}
                searchQuery={`${page.here} ${gap.headline}`}
                unverifiedText="没查到出处，这句是 AI 凭印象说的。"
                uncheckedText="这句是 AI 凭印象说的，没上网查过。"
              />
            </>
          )}
          {gap.whyNow && (
            <p className="text-sm leading-7">
              <span className="text-muted-foreground">为什么是现在：</span>
              {gap.whyNow}
            </p>
          )}
          {page.rechecks.length > 0 && (
            <ul className="space-y-1 font-mono text-xs text-muted-foreground">
              {page.rechecks.map((r) => (
                <li key={r.checked_on}>
                  {r.checked_on} 重查：{r.verdict === "arrived" ? "有了" : r.verdict === "still" ? "还是没有" : "没查清"} —— {r.japan}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section n="③" title="能不能搬过来">
          <TransferView
            key={page.transfer?.created_at ?? "none"}
            signalId={signalId}
            side={side}
            here={page.here}
            there={page.there}
            initial={page.transfer}
          />
        </Section>

        <Section n="④" title={`${page.here}这边有人在为这个头疼吗`}>
          <VoicesView key={page.voices?.created_at ?? "none"} signalId={signalId} side={side} here={page.here} initial={page.voices} />
        </Section>

        <Section n="⑤" title="同类东西以前来日本的结果">
          {page.here !== "日本" ? (
            <p className="text-sm leading-7 text-muted-foreground">
              时差图谱只记「那边先有、后来到日本」的，反方向（日本有、中国还没有）还没有，这一格先空着。
            </p>
          ) : page.cases === null ? (
            <p className="text-sm leading-7 text-muted-foreground">时差图谱还没建（迁移 073 没跑）。</p>
          ) : page.deep === "missing-schema" ? (
            <p className="text-sm leading-7 text-muted-foreground">{MISSING_083}</p>
          ) : (
            <>
              <CategoryPicker signalId={signalId} side={side} initial={category} />
              {category && (
                <>
                  <p className="text-sm leading-7">{baseSentence(category, categoryBase(sameKind))}</p>
                  <ul className="space-y-2">
                    {sameKind.map((c) => (
                      <li key={c.id} className="text-sm leading-7">
                        {c.thing}：{c.origin === "china" ? "中国" : "美国"} {c.origin_date} → 日本 {c.japan_date ?? "至今没到"} · {ATLAS_OUTCOMES[c.outcome]}
                        {page.caseNotices[c.id] && (
                          <p className="text-xs text-muted-foreground">
                            官报决算：<NoticeLine notice={page.caseNotices[c.id]} />
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                  <Link href="/signals/atlas" className="text-sm text-primary underline-offset-4 hover:underline">
                    去时差图谱看全部 →
                  </Link>
                </>
              )}
            </>
          )}
        </Section>

        <Section n="⑥" title="官报里看得到的">
          {!page.kanpo.ready ? (
            <p className="text-sm leading-7 text-muted-foreground">官报决算还没建（迁移 082 没跑）。</p>
          ) : (
            <>
              {gap.funded && (
                <p className="text-sm leading-7">
                  <span className="text-muted-foreground">{gap.funded.company}：</span>
                  {page.kanpo.fundedNotice ? <NoticeLine notice={page.kanpo.fundedNotice} /> : "官报里没对上。"}
                </p>
              )}
              {page.kanpo.watchRows.map((r) => (
                <p key={r.watch.id} className="text-sm leading-7">
                  <span className="text-muted-foreground">{r.watch.name_zh}（你的名单）：</span>
                  {r.notices[0] ? <NoticeLine notice={r.notices[0]} /> : "官报里还没对上它的日本法人。"}
                </p>
              ))}
              <p className="text-xs leading-6 text-muted-foreground">
                只认公司名完全相同的，没对上不代表没登。想盯哪家中国公司，加进
                <Link href="/signals/kanpo" className="mx-1 text-primary underline-offset-4 hover:underline">
                  在日本的中国公司
                </Link>
                名单。
              </p>
            </>
          )}
        </Section>

        <Section n="⑦" title="有没有人掏钱">
          {gap.funded ? (
            <p className="text-sm leading-7">
              <span className="text-muted-foreground">{page.here}已经有人拿到钱在做：</span>
              {gap.funded.company}
              <a href={gap.funded.url} target="_blank" rel="noopener noreferrer" className="ml-1 text-primary underline-offset-4 hover:underline">
                来源 ↗
              </a>
            </p>
          ) : (
            <p className="text-sm leading-7 text-muted-foreground">{page.here}这边还没查到有公司为这件事拉到投资。</p>
          )}
          <p className="text-sm">
            <Link href={`/signals/gaps/door?side=${side}&signal=${signalId}`} className="text-primary underline-offset-4 hover:underline">
              {page.door
                ? `假门测试${page.door.open ? "" : "（关着）"}：看了 ${page.door.views} 次 · 留了邮箱 ${page.door.signups} 人 →`
                : `还没做假门测试：${page.here}的陌生人看到价格，愿不愿意留邮箱 →`}
            </Link>
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            {page.demand
              ? `周刊上：说想要 ${page.demand.pain} · 问哪里买 ${page.demand.pay} · 想聊 ${page.demand.wantsTalk}`
              : "周刊上还没人回应过这一条。"}
          </p>
        </Section>

        <Section n="⑧" title="你的判断">
          {page.deep === "missing-schema" ? (
            <p className="text-sm leading-7 text-muted-foreground">{MISSING_083}</p>
          ) : (
            <DeepJudgment signalId={signalId} side={side} here={page.here} initial={deep?.stance ?? null} />
          )}
        </Section>
      </div>
    </PageContainer>
  );
}
