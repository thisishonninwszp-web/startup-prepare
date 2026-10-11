import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import type { SignalKind } from "@/lib/domains/signals/feeds";
import { getSignalPageExtras, listPendingSignals } from "./queries";
import { BriefPanel, ContextEditor } from "./brief-panel";
import { RefreshButton, SignalList } from "./signal-list";

export const dynamic = "force-dynamic";
// 手动抓取、生成精选的 server action 跟着页面的时长上限走，默认 10 秒不够。
export const maxDuration = 60;

const TABS: { kind: SignalKind; label: string; description: string }[] = [
  {
    kind: "news",
    label: "新闻",
    description: "Yahoo!、日经系、科技媒体，加上利率汇率和转职的关键词。看世界在发生什么。",
  },
  {
    kind: "tools",
    label: "工具",
    description: "GitHub 上最近 7 天新建、星数涨得快的仓库。看大家在用什么新东西。",
  },
];

export default async function SignalsPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const kind: SignalKind = searchParams.tab === "tools" ? "tools" : "news";
  const tab = TABS.find((t) => t.kind === kind) ?? TABS[0];
  const [items, extras] = await Promise.all([
    listPendingSignals(kind),
    getSignalPageExtras(user.id, kind),
  ]);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="External signals"
        title="外部信号"
        description="每天早上 7 点自动抓一轮，AI 先替你挑 5 条、讲清楚为什么。哪条让你多看了一眼，就记一笔；没动过的两周后自己清掉。"
        actions={items !== null && <RefreshButton kind={kind} />}
      />

      <nav className="mb-2 flex gap-2">
        {TABS.map((t) => (
          <Button key={t.kind} asChild size="sm" variant={t.kind === kind ? "secondary" : "ghost"}>
            <Link href={t.kind === "news" ? "/signals" : "/signals?tab=tools"}>{t.label}</Link>
          </Button>
        ))}
      </nav>
      <p className="mb-6 text-sm leading-7 text-muted-foreground">{tab.description}</p>

      {items === null ? (
        <div className="rounded-lg border border-status-validating/30 bg-status-validating/10 p-5 text-sm text-status-validating">
          数据库还差一步：迁移 052 没跑，新闻排不了序。到 Supabase 的 SQL Editor 执行
          supabase/migrations/052_external_signals_published_at.sql 之后再来。
        </div>
      ) : (
        <>
          {extras.available ? (
            <>
              <ContextEditor initial={extras.context} />
              <BriefPanel kind={kind} items={extras.brief} />
            </>
          ) : (
            <div className="mb-6 rounded-lg border border-status-validating/30 bg-status-validating/10 p-4 text-sm text-status-validating">
              每日精选还差一步：迁移 053 没跑。执行 supabase/migrations/053_signal_briefs.sql 之后，这里会出现 AI 挑的 5 条。
            </div>
          )}
          <h2 className="mb-3 mt-8 text-base font-semibold">全部（{items.length}）</h2>
          <SignalList items={items} kind={kind} />
        </>
      )}
    </PageContainer>
  );
}
