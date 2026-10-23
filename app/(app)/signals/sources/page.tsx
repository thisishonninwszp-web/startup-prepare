import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { BarList } from "@/components/ui/bar-list";
import { tallyFeedback } from "@/lib/domains/signals/feedback";
import { decisionCounts, DROPPED_DAYS, droppedSentences, HEALTH_DAYS, sourceHealth, type SourceHealth } from "@/lib/domains/signals/source-health";
import { openCounts } from "@/lib/domains/signals/opens";
import { tavilyUsage } from "@/lib/external";
import { googleSearchCount } from "@/lib/web-search";
import { envStatus } from "@/lib/domains/signals/env-status";
import { rakutenReferer } from "@/lib/rakuten";

export const dynamic = "force-dynamic";

const SECTION_NAMES: Record<string, string> = {
  news: "今天的世界",
  calendar: "已经定了的未来",
  voices: "谁在头疼什么",
  money: "谁在掏钱",
  tools: "新工具和新可能",
};

function verdict(r: SourceHealth, decided: number): string {
  if (r.fetched === 0) return "两周一条都没抓到，多半是源坏了";
  if (r.picked === 0) return "抓了不少，一次也没被挑中";
  if (decided === 0) return "被挑进报告了，但一条都没进你的决定";
  return "";
}

export default async function SourcesPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const [feedback, health, google, tavily, dropped, decided, opened] = await Promise.all([
    tallyFeedback(user.id, HEALTH_DAYS),
    sourceHealth(user.id),
    googleSearchCount().catch(() => null),
    tavilyUsage(),
    droppedSentences(user.id).catch(() => []),
    decisionCounts(user.id).catch(() => new Map<string, number>()),
    // 被动记录（迁移 100）：每个源最近这段时间他点开过几条
    openCounts(user.id, HEALTH_DAYS).catch(() => new Map<string, number>()),
  ]);
  const anyFeedback = feedback.some((f) => f.useful + f.useless > 0);
  const keys = envStatus(process.env);
  const referer = rakutenReferer();

  return (
    <PageContainer width="narrow">
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
        <h2 className="mb-3 text-base font-semibold">删掉的空话</h2>
        <p className="text-sm leading-7 text-muted-foreground">
          最近 {DROPPED_DAYS} 天，报告里删了 {dropped.length} 句只给前面下结论的话（「这表明……」「，这意味着……」）。
          点开看删了哪些 —— 要是里面有人名、公司、数字、日期，就是规则删错了，记下来改。
        </p>
        {dropped.length > 0 && (
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-muted-foreground">看删了哪些</summary>
            <ul className="mt-2 space-y-1">
              {dropped.map((d, i) => (
                <li key={i} className="leading-7">
                  <span className="mr-2 font-mono text-xs text-muted-foreground">
                    {d.date} · {SECTION_NAMES[d.kind] ?? d.kind}
                  </span>
                  {d.sentence}
                </li>
              ))}
            </ul>
          </details>
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

      <section className="mb-10">
        <h2 className="mb-3 text-base font-semibold">外部接口的 Key 配好了没有</h2>
        <ul className="space-y-2 text-sm leading-7">
          {keys.map((k) => (
            <li key={k.label}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span>
                  {k.label}
                  <span className="ml-2 text-xs text-muted-foreground">{k.use}</span>
                </span>
                <span className={`shrink-0 font-mono text-xs ${k.ok ? "text-muted-foreground" : "text-destructive"}`}>{k.ok ? "配了" : "没配"}</span>
              </div>
              <p className="font-mono text-xs text-muted-foreground">
                {k.slots.map((s, i) => (
                  <span key={i} className="mr-3">
                    {s.using ? `${s.using} ✓` : `${s.names.join(" 或 ")} ✗`}
                  </span>
                ))}
              </p>
              {!k.ok && <p className="text-xs text-muted-foreground">免费拿：{k.how}</p>}
              {k.label === "楽天市场" && (
                <p className="text-xs text-muted-foreground">
                  发给楽天的来源网址：<span className="font-mono">{referer}</span>（要和楽天那边 Allowed websites 填的域名一样）
                </p>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs leading-6 text-muted-foreground">
          只看线上这一次部署读不读得到，不显示值。在 Vercel 里加了或改了变量，要 Redeploy 一次才生效；变量要勾 Production。
        </p>
      </section>

      <section className="mb-10">
        <BarList
          title={`最近 ${HEALTH_DAYS} 天，每个源有几条进了你的决定`}
          items={health
            .filter((r) => r.picked > 0 || (decided.get(r.source) ?? 0) > 0)
            .map((r) => ({ label: r.label, value: decided.get(r.source) ?? 0 }))
            .sort((a, b) => b.value - a.value)}
          unit=" 条"
          empty="两周里还没有一条进了决定：记成观察、记判断、补进想法的缺口、听一听、开假门，做过一次就会出现在这里。"
        />
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
                  抓到 {r.fetched} · 挑中 {r.picked} · 你点开 {opened.get(r.source) ?? 0} · 进了决定 {decided.get(r.source) ?? 0}
                </span>
              </div>
              {verdict(r, decided.get(r.source) ?? 0) && (
                <p className="mt-1 text-xs text-muted-foreground">{verdict(r, decided.get(r.source) ?? 0)}</p>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          挑中的数只算精选，不算「也值得一看」。没被挑中不一定是源不好，也可能是那一节每天名额太少。
          「进了决定」数的是真的被你用上的：记成了观察、记过判断、补进了想法的缺口、在差距清单里听过原话或开过假门。
          信息只有改变一个决定时才有用 —— 两周下来一条都进不了决定的源，读得再多也是噪音。
        </p>
      </section>

      <p className="mt-10 text-sm">
        <Link href="/signals/lab" className="text-primary underline-offset-4 hover:underline">
          每天挑的那几条挑得好不好？去「挑法盲测」比一比 →
        </Link>
      </p>
    </PageContainer>
  );
}
