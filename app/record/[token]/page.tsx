import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { loadPublicRecord, type PublicBet } from "@/lib/domains/signals/public-record";

export const dynamic = "force-dynamic";

// 他自己把链接贴出去才有人看到；不进搜索引擎
export const metadata: Metadata = { title: "公开对账", robots: { index: false, follow: false } };

const OUTCOME: Record<PublicBet["outcome"], string> = { pending: "还在等", hit: "应验了", miss: "没应验" };

/**
 * 公开对账页：周刊上押过的判断，到期对没对，全摆出来。错的也在。
 * 不用登录，口令对不上就是 404。只显示这几条，别的一概不显示。
 */
export default async function PublicRecordPage({ params }: { params: { token: string } }) {
  const bets = await loadPublicRecord(params.token);
  if (!bets) notFound();
  const count = (o: PublicBet["outcome"]) => bets.filter((b) => b.outcome === o).length;

  return (
    <PageContainer width="narrow">
      <div className="py-12">
        <PageHeader
          eyebrow="Track record"
          title="说过的判断，都摆在这里"
          description="周刊上每一条「那边有、这边还没有」，我都判断过两年内这边会不会出现。到期对账，错的也照样留着。能自动对账的，附了查到的出处。"
        />
        <p className="mb-8 font-mono text-sm">
          判断了 {bets.length} 条 · 应验 {count("hit")} · 没应验 {count("miss")} · 还在等 {count("pending")}
        </p>
        {bets.length === 0 ? (
          <p className="text-sm leading-7 text-muted-foreground">这里空着。第一期周刊发出去以后，判断的那几条会出现在这里。</p>
        ) : (
          <ul className="space-y-6">
            {bets.map((b, i) => (
              <li key={i} className="border-b border-border pb-6 last:border-b-0">
                <p className="font-mono text-xs text-muted-foreground">
                  {b.made_on} 判断 · {b.due_on} 到期 · {OUTCOME[b.outcome]}
                </p>
                <p className="mt-1 text-sm leading-7 text-muted-foreground">{b.question}</p>
                <p className="mt-1 border-l-2 border-primary pl-3 text-base font-medium leading-8">{b.judgment}</p>
                {b.autoNote && <p className="mt-2 text-xs leading-6 text-muted-foreground">{b.autoNote}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageContainer>
  );
}
