import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { tallyFeedback } from "@/lib/domains/signals/feedback";
import { HEALTH_DAYS, sourceHealth, type SourceHealth } from "@/lib/domains/signals/source-health";

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

  const [feedback, health] = await Promise.all([tallyFeedback(user.id, HEALTH_DAYS), sourceHealth(user.id)]);
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
