import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getLifeCompassData } from "./queries";
import { AlignmentReport } from "./alignment-report";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  observation: "观察",
  hypothesis: "假设",
  validating: "验证中",
  mvp: "MVP候选",
  archived: "归档",
};

function formatRelativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  if (days < 30) return `${Math.floor(days / 7)} 周前`;
  return `${Math.floor(days / 30)} 个月前`;
}

export default async function LifePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const data = await getLifeCompassData(user.id);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight">生活罗盘</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          你把时间用在哪里？你追的这些，真的通向你想要的未来吗？
        </p>
      </div>

      {/* 梦想锚点 */}
      <section className="mb-10">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          梦想锚点
        </h2>
        {data.dreams.length === 0 ? (
          <div className="rounded-lg border bg-muted/30 px-4 py-5 text-center">
            <p className="text-sm text-muted-foreground">还没有活跃的梦想。</p>
            <Link
              href="/dreams"
              className="mt-2 inline-block text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground"
            >
              去梦想系统创建 →
            </Link>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {data.dreams.map((dream) => (
              <Link
                key={dream.id}
                href={`/dreams/${dream.id}`}
                className="group rounded-lg border bg-card px-4 py-3 hover:border-foreground/30 transition-colors"
              >
                <p className="text-sm font-medium leading-snug group-hover:underline">
                  {dream.title}
                </p>
                {dream.scene_title && (
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-1">
                    {dream.scene_title}
                  </p>
                )}
                {dream.inner_state && !dream.scene_title && (
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                    {dream.inner_state}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* 生活领域 */}
      <section className="mb-10">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          生活领域
        </h2>
        {data.domains.length === 0 ? (
          <div className="rounded-lg border bg-muted/30 px-4 py-5 text-center">
            <p className="text-sm text-muted-foreground">
              还没有带标签的想法。给想法添加标签，就能按生活领域组织它们。
            </p>
            <Link
              href="/ideas"
              className="mt-2 inline-block text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground"
            >
              去想法库添加标签 →
            </Link>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.domains.map((domain) => {
              const statusItems = Object.entries(domain.by_status)
                .filter(([, count]) => count > 0)
                .map(([status, count]) => `${STATUS_LABELS[status] ?? status} ${count}`)
                .join(" · ");

              return (
                <div
                  key={domain.tag}
                  className={`rounded-lg border bg-card px-4 py-3 space-y-1.5 ${
                    domain.is_stale ? "border-yellow-400/50 dark:border-yellow-600/40" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{domain.tag}</span>
                    {domain.is_stale && (
                      <span className="text-[10px] text-yellow-600 dark:text-yellow-400 font-medium">
                        ⚠ 停滞
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{statusItems}</p>
                  {domain.latest_activity && (
                    <p className="text-[10px] text-muted-foreground">
                      最近活动：{formatRelativeDate(domain.latest_activity)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 近 30 天活动 */}
      <section className="mb-10">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          近 30 天活动
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "新建想法", value: data.activity.new_ideas, unit: "个" },
            { label: "完成验证", value: data.activity.new_validations, unit: "条" },
            { label: "做出决策", value: data.activity.new_decisions, unit: "个" },
          ].map(({ label, value, unit }) => (
            <div key={label} className="rounded-lg border bg-card px-4 py-3 space-y-0.5">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {label}
              </p>
              <p className="text-xl font-semibold tabular-nums">
                {value}
                <span className="ml-0.5 text-xs font-normal text-muted-foreground">{unit}</span>
              </p>
            </div>
          ))}
          <div className="rounded-lg border bg-card px-4 py-3 space-y-0.5">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              最活跃领域
            </p>
            <p className="text-sm font-medium truncate">
              {data.activity.most_active_domain ?? "—"}
            </p>
          </div>
        </div>
      </section>

      {/* AI 对齐审视 */}
      <section>
        <AlignmentReport hasEnoughData={data.has_enough_data} />
      </section>
    </div>
  );
}
