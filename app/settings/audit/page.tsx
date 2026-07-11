import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { AppShell } from "@/components/app-shell";

export const dynamic = "force-dynamic";

/**
 * 模块使用审计：每个模块最后一次产生数据是什么时候。
 * 敢 Kill 自己的功能，和敢 Kill 自己的想法，是同一种肌肉。
 * 只陈述事实（最后活动时间），把"要不要收起某个模块"的判断留给使用者。
 */

type ModuleProbe = {
  label: string;
  href: string;
  table: string;
  timeColumn: string;
  /** user 过滤方式：直接列 user_id，或经由 ideas 关联。 */
  userFilter: "user_id" | "via_ideas";
};

const MODULE_PROBES: ModuleProbe[] = [
  { label: "捕捉（观察）", href: "/capture", table: "observations", timeColumn: "created_at", userFilter: "user_id" },
  { label: "想法库", href: "/ideas", table: "ideas", timeColumn: "last_activity_at", userFilter: "user_id" },
  { label: "真实验证", href: "/ideas", table: "validations", timeColumn: "contacted_at", userFilter: "via_ideas" },
  { label: "决策", href: "/learnings", table: "decisions", timeColumn: "decided_at", userFilter: "via_ideas" },
  { label: "预测", href: "/retrospectives", table: "predictions", timeColumn: "made_at", userFilter: "user_id" },
  { label: "AI 质疑", href: "/ideas", table: "ai_sessions", timeColumn: "created_at", userFilter: "via_ideas" },
  { label: "现实材料箱", href: "/materials", table: "reality_materials", timeColumn: "created_at", userFilter: "user_id" },
  { label: "现状认识", href: "/reality", table: "reality_cases", timeColumn: "created_at", userFilter: "user_id" },
  { label: "顾客视点", href: "/customer-view", table: "customer_cases", timeColumn: "created_at", userFilter: "user_id" },
  { label: "复盘（日反思）", href: "/retrospectives", table: "daily_reflections", timeColumn: "created_at", userFilter: "user_id" },
  { label: "复盘（周期）", href: "/retrospectives", table: "retro_periods", timeColumn: "created_at", userFilter: "user_id" },
  { label: "梦想系统", href: "/dreams", table: "dream_cases", timeColumn: "created_at", userFilter: "user_id" },
  { label: "推理 · 贝叶斯", href: "/reasoning", table: "bayesian_beliefs", timeColumn: "created_at", userFilter: "user_id" },
  { label: "推理 · 重构", href: "/reasoning", table: "reframing_sessions", timeColumn: "created_at", userFilter: "user_id" },
  { label: "顾问团", href: "/council", table: "council_sessions", timeColumn: "created_at", userFilter: "user_id" },
  { label: "知识库", href: "/knowledge", table: "knowledge_cards", timeColumn: "created_at", userFilter: "user_id" },
  { label: "公司档案", href: "/companies", table: "companies", timeColumn: "created_at", userFilter: "user_id" },
  { label: "公司知识库", href: "/company-kb", table: "company_kb_notes", timeColumn: "created_at", userFilter: "user_id" },
  { label: "触达规划", href: "/outreach", table: "outreach_canvases", timeColumn: "created_at", userFilter: "user_id" },
];

async function probeModule(
  probe: ModuleProbe,
  userId: string
): Promise<string | null> {
  let query = supabaseAdmin
    .from(probe.table)
    .select(
      probe.userFilter === "via_ideas"
        ? `${probe.timeColumn}, ideas!inner(user_id)`
        : probe.timeColumn
    )
    .order(probe.timeColumn, { ascending: false })
    .limit(1);
  query =
    probe.userFilter === "via_ideas"
      ? query.eq("ideas.user_id", userId)
      : query.eq("user_id", userId);
  const { data, error } = await query;
  if (error) {
    // 表可能尚未迁移（软依赖），按无数据处理。
    console.error(`审计 ${probe.table} 失败`, error.message);
    return null;
  }
  const row = (data ?? [])[0] as unknown as
    | Record<string, unknown>
    | undefined;
  const value = row?.[probe.timeColumn];
  return typeof value === "string" ? value : null;
}

function daysAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export default async function ModuleAuditPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const results = await Promise.all(
    MODULE_PROBES.map(async (probe) => ({
      probe,
      lastActivity: await probeModule(probe, user.id),
    }))
  );

  const sorted = results.sort((a, b) => {
    if (!a.lastActivity && !b.lastActivity) return 0;
    if (!a.lastActivity) return 1;
    if (!b.lastActivity) return -1;
    return b.lastActivity.localeCompare(a.lastActivity);
  });

  const idleCount = sorted.filter(
    (r) => !r.lastActivity || daysAgo(r.lastActivity) > 30
  ).length;

  return (
    <AppShell>
      <main className="animate-fade-up mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <header className="mb-8">
          <h1 className="text-xl font-semibold tracking-tight">模块使用审计</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            每个模块最后一次产生数据的时间。超过 30 天没动的模块，问问自己还需不需要它——
            敢 Kill 功能和敢 Kill 想法是同一种肌肉。
          </p>
          {idleCount > 0 && (
            <p className="mt-2 text-sm">
              有 <span className="font-mono tabular-nums">{idleCount}</span>{" "}
              个模块超过 30 天没有任何新数据。
            </p>
          )}
        </header>

        <ul className="space-y-2">
          {sorted.map(({ probe, lastActivity }) => {
            const idle = !lastActivity || daysAgo(lastActivity) > 30;
            return (
              <li key={`${probe.table}-${probe.label}`}>
                <Link
                  href={probe.href}
                  className={
                    "flex items-center justify-between gap-3 rounded-lg border p-4 text-sm transition-colors hover:bg-muted " +
                    (idle ? "opacity-60" : "")
                  }
                >
                  <span>{probe.label}</span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    {lastActivity
                      ? daysAgo(lastActivity) === 0
                        ? "今天"
                        : `${daysAgo(lastActivity)} 天前`
                      : "从未使用"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </main>
    </AppShell>
  );
}
