import Link from "next/link";
import { ArrowRight, Plus, Quote, Search, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { CustomerNav } from "./customer-nav";
import {
  listCustomerCases,
  listCustomerMaterials,
  listCustomerTopics,
} from "./queries";

export const dynamic = "force-dynamic";

const MARKET_LABEL = { cn: "中国", jp: "日本", en: "英语市场" } as const;

export default async function CustomerViewPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [cases, candidates, kept, topics] = await Promise.all([
    listCustomerCases(user!.id),
    listCustomerMaterials(user!.id, "candidate"),
    listCustomerMaterials(user!.id, "kept"),
    listCustomerTopics(user!.id),
  ]);

  return (
    <AppShell>
      <CustomerNav />
      <main className="min-h-screen">
        <section className="bg-dotgrid border-b px-4 py-10 sm:px-8 lg:px-12">
          <div className="mx-auto flex max-w-6xl flex-col gap-8 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Evidence-grounded customer research
              </p>
              <h1 className="mt-5 max-w-3xl text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
                不替顾客想。先让顾客的原话改变你。
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
                从公开材料和真实访谈建立证据约束的顾客代理。代理可以说话，但每句话都必须知道自己凭什么说。
              </p>
            </div>
            <Link
              href="/customer-view/new"
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              <Plus className="size-4" />
              新建顾客课题
            </Link>
          </div>
        </section>

        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 lg:px-12">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat icon={Users} value={cases.length} label="顾客课题" />
            <Stat icon={Quote} value={kept.length} label="保留材料关联" />
            <Stat icon={Search} value={candidates.length} label="待审候选" />
          </div>

          {candidates.length > 0 && (
            <Link
              href="/customer-view/inbox"
              className="mt-6 flex items-center gap-3 rounded-lg border border-orange-300 bg-orange-50 p-4 text-sm text-orange-950"
            >
              <span className="min-w-0 flex-1">
                有 {candidates.length} 条网络材料等待快速审核
              </span>
              <ArrowRight className="size-4" />
            </Link>
          )}

          <section className="mt-10">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-sm font-medium">研究课题</h2>
              <span className="font-mono text-xs text-muted-foreground">
                {topics.filter((topic) => topic.enabled).length} ACTIVE TOPICS
              </span>
            </div>
            {cases.length === 0 ? (
              <div className="rounded-lg border border-dashed p-10 text-center">
                <p className="text-sm">还没有顾客课题。</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  从“我以为顾客是怎样的人”开始，然后让证据反驳它。
                </p>
              </div>
            ) : (
              <div className="divide-y border-y">
                {cases.map((item) => (
                  <Link
                    key={item.id}
                    href={`/customer-view/${item.id}`}
                    className="group grid gap-3 py-5 transition-colors hover:bg-muted/40 sm:grid-cols-[1fr_auto] sm:px-3"
                  >
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-medium">{item.title}</h3>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {item.customer_hypothesis}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {item.markets.map((market) => (
                          <span
                            key={market}
                            className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {MARKET_LABEL[market]}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{item.kept_count} 保留</span>
                      <span>{item.candidate_count} 待审</span>
                      <span>{item.proxy_count} 代理版</span>
                      <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </AppShell>
  );
}

function Stat({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Users;
  value: number;
  label: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <Icon className="size-4 text-muted-foreground" strokeWidth={1.7} />
      <div className="mt-4 font-mono text-2xl tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
