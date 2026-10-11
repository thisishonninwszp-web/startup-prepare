import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import type { SignalKind } from "@/lib/domains/signals/feeds";
import { listPendingSignals } from "../queries";
import { RefreshButton, SignalList } from "../signal-list";

export const dynamic = "force-dynamic";
// 「现在抓一次」要抓 RSS + 补简介，默认 10 秒不够。
export const maxDuration = 60;

const TABS: { kind: SignalKind; label: string; description: string }[] = [
  {
    kind: "news",
    label: "新闻",
    description: "Yahoo!、科技媒体，加上利率汇率、融资和新业务的关键词。按发布时间排，最新的在上面。",
  },
  {
    kind: "calendar",
    label: "日程",
    description: "法规修改前的意见征集（e-Gov），以及写明了施行、义务化日期的消息。",
  },
  {
    kind: "voices",
    label: "头疼事",
    description: "一线干活的人自己在讨论的麻烦（はてブ热门、note #経営），以及招人难、人手不足的报道。",
  },
  {
    kind: "tools",
    label: "工具",
    description: "GitHub 上最近 7 天新建、星数涨得快的仓库。",
  },
];

export default async function SignalsInboxPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const kind: SignalKind = TABS.some((t) => t.kind === searchParams.tab)
    ? (searchParams.tab as SignalKind)
    : "news";
  const tab = TABS.find((t) => t.kind === kind) ?? TABS[0];
  const items = await listPendingSignals(kind);

  return (
    <PageContainer>
      <p className="mb-4 text-sm">
        <Link href="/signals" className="text-muted-foreground transition-colors duration-150 hover:text-foreground">
          ← 今日报告
        </Link>
      </p>
      <PageHeader
        eyebrow="All signals"
        title="全部条目"
        description="报告只挑了 5 条，这里是全部。哪条让你多看了一眼，就记一笔；没动过的两周后自己清掉。"
        actions={items !== null && <RefreshButton kind={kind} />}
      />

      <nav className="mb-2 flex gap-2">
        {TABS.map((t) => (
          <Button key={t.kind} asChild size="sm" variant={t.kind === kind ? "secondary" : "ghost"}>
            <Link href={t.kind === "news" ? "/signals/inbox" : `/signals/inbox?tab=${t.kind}`}>{t.label}</Link>
          </Button>
        ))}
      </nav>
      <p className="mb-6 text-sm leading-7 text-muted-foreground">{tab.description}</p>

      {items === null ? (
        <div className="rounded-lg border border-status-validating/30 bg-status-validating/10 p-5 text-sm text-status-validating">
          数据库还差一步：迁移 052 没跑。到 Supabase 的 SQL Editor 执行
          supabase/migrations/052_external_signals_published_at.sql 之后再来。
        </div>
      ) : (
        <SignalList items={items} kind={kind} />
      )}
    </PageContainer>
  );
}
