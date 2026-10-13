import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { tallyFeedback } from "@/lib/domains/signals/feedback";
import { HEALTH_DAYS, sourceHealth, type SourceHealth } from "@/lib/domains/signals/source-health";
import { tavilyUsage } from "@/lib/external";
import { googleSearchCount } from "@/lib/web-search";

export const dynamic = "force-dynamic";

const SECTION_NAMES: Record<string, string> = {
  news: "今天的世界",
  calendar: "已经定了的未来",
  voices: "谁在头疼什么",
  money: "谁在掏钱",
  tools: "新工具和新可能",
};

function verdict(r: SourceHealth): string {
  if (r.fetched === 0) return "两周一条都没抓到，多半是源坏了";
  if (r.picked === 0) return "抓了不少，一次也没被挑中";
  return "";
}

export default async function SourcesPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const [feedback, health, google, tavily] = await Promise.all([
    tallyFeedback(user.id, HEALTH_DAYS),
    sourceHealth(user.id),
    googleSearchCount().catch(() => null),
    tavilyUsage(),
  ]);
  const anyFeedback = feedback.some((f) => f.useful + f.useless > 0);

  return (
    <PageContainer width="narrow">
      <p className="mb-4 text-sm">
        <Link href="/signals" className="text-muted-foreground transition-colors duration-150 hover:text-foreground">
          ← 今日报告
        </Link>
      </p>
      <PageHeader
        eyebrow="Sources"
        title="信息源体检"
        description={`最近 ${HEALTH_DAYS} 天：每一节你点了几次有用、几次没用；每个源抓进来几条、被挑进报告几条。哪个该撤、哪节该改，你看着定。`}
      />

      <section className="mb-10">
        <h2 className="mb-3 text-base font-semibold">每一节有没有用</h2>
        {anyFeedback ? (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {feedback.map((f) => (
              <li key={f.kind} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <span>{SECTION_NAMES[f.kind] ?? f.kind}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  有用 {f.useful} · 没用 {f.useless}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            这里空着。报告每一节底下有「有用 / 没用」，看完顺手点一下，两周后这里就能看出哪节一直在被跳过。
          </p>
        )}
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-base font-semibold">上网搜索用了多少</h2>
        <ul className="space-y-1 text-sm leading-7">
          <li>
            Google（Gemini 自带的搜索）：
            {google ? (
              <span className="font-mono text-xs text-muted-foreground">
                最近 24 小时 {google.total} 次{google.failed > 0 ? `，其中 ${google.failed} 次出错、改用了 Tavily` : ""}
              </span>
            ) : (
              <span className="text-muted-foreground">这次没数出来。</span>
            )}
          </li>
          <li>
            Tavily（Google 搜不到或出错时才用）：
            {tavily === "unconfigured" ? (
              <span className="text-muted-foreground">没配 Key，Google 不行时就搜不到了。</span>
            ) : tavily ? (
              <span className="font-mono text-xs text-muted-foreground">
                这个周期用了 {tavily.used}
                {tavily.limit !== null ? ` / ${tavily.limit}` : ""} 次
              </span>
            ) : (
              <span className="text-muted-foreground">用量这次没读到。</span>
            )}
          </li>
        </ul>
        <p className="mt-2 text-xs leading-6 text-muted-foreground">
          Google 这边免费层一天 500 次、付费层一天 1500 次不收钱（按 Google 的日子算，不是日本时间）。往下推每推一层大约搜 9 次，
          差距清单每天扫一轮大约 8 次。
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">每个源</h2>
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {health.map((r) => (
            <li key={r.source} className="px-4 py-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span>
                  {r.label}
                  <span className="ml-2 text-xs text-muted-foreground">{SECTION_NAMES[r.kind]}</span>
                </span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  抓到 {r.fetched} · 挑中 {r.picked}
                </span>
              </div>
              {verdict(r) && <p className="mt-1 text-xs text-muted-foreground">{verdict(r)}</p>}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          挑中的数只算精选，不算「也值得一看」。没被挑中不一定是源不好，也可能是那一节每天名额太少。
        </p>
      </section>
    </PageContainer>
  );
}
