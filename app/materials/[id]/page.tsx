import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  createRealityMaterialRoute,
  retryRealityMaterialAi,
  setRealityMaterialDecision,
} from "../actions";
import { getRealityMaterial } from "../queries";
import {
  DEPARTMENT_LABELS,
  ROUTE_LABELS,
  SOURCE_LABELS,
  STATUS_LABELS,
  routeHref,
} from "../material-labels";
import { MATERIAL_ROUTE_TARGETS, type MaterialRouteTarget } from "../types";

export const dynamic = "force-dynamic";

export default async function MaterialDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const material = await getRealityMaterial(user.id, params.id);
  if (!material) notFound();
  const reviewBlocksRouting = material.latest_review?.should_not_route === true;
  const canRoute =
    ["confirmed", "summary_only"].includes(material.status) && !reviewBlocksRouting;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/materials"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← 返回现实材料箱
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            {material.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {SOURCE_LABELS[material.source_type]} ·{" "}
            {STATUS_LABELS[material.status]}
          </p>
        </div>
        {material.status === "failed" ? (
          <form action={retryRealityMaterialAi}>
            <input type="hidden" name="material_id" value={material.id} />
            <button className="rounded-md border px-3 py-2 text-sm hover:bg-muted">
              重试 AI 审阅
            </button>
          </form>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Panel title="1. 原始材料">
            <div className="space-y-3">
              {material.source_url ? (
                <p className="text-sm">
                  来源 URL：
                  <a
                    href={material.source_url}
                    className="underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {material.source_url}
                  </a>
                </p>
              ) : null}
              {material.file_name ? (
                <p className="text-sm text-muted-foreground">
                  文件：{material.file_name}{" "}
                  {material.file_size ? `(${material.file_size} bytes)` : ""}
                </p>
              ) : null}
              {material.redactions.length > 0 ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  已自动遮蔽：{material.redactions.join("、")}
                </p>
              ) : null}
              <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-xl bg-muted p-4 text-sm leading-6">
                {material.sanitized_text || "暂无脱敏文本"}
              </pre>
              {material.extraction?.unreadable.length ? (
                <div className="rounded-md border p-3 text-xs text-muted-foreground">
                  不可读取 / 截断提示：
                  <ul className="mt-1 list-disc pl-5">
                    {material.extraction.unreadable.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </Panel>

          <Panel title="2. 中书省起草">
            {material.latest_draft ? (
              <div className="space-y-4 text-sm">
                <Field label="摘要" items={[material.latest_draft.summary]} />
                <Field
                  label="原文片段"
                  items={material.latest_draft.original_fragments}
                />
                <Field
                  label="已确认事实"
                  items={material.latest_draft.confirmed_facts}
                />
                <Field
                  label="AI 推断"
                  items={material.latest_draft.possible_inferences}
                />
                <Field label="未知" items={material.latest_draft.unknowns} />
                <div className="flex flex-wrap gap-1.5">
                  {material.latest_draft.suggested_departments.map(
                    (department) => (
                      <span
                        key={department}
                        className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
                      >
                        {DEPARTMENT_LABELS[department]}
                      </span>
                    )
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                尚未生成中书省草稿。AI 失败时不会丢失原始材料。
              </p>
            )}
          </Panel>

          <Panel title="3. 门下省驳议">
            {material.latest_review ? (
              <div className="space-y-4 text-sm">
                <Field
                  label="事实 / 推断边界"
                  items={material.latest_review.fact_inference_checks}
                />
                <Field
                  label="证据不足"
                  items={material.latest_review.insufficient_evidence}
                />
                <Field
                  label="可能误导当前判断"
                  items={material.latest_review.misleading_risks}
                />
                <Field
                  label="禁止自动写入"
                  items={material.latest_review.blocked_auto_writes}
                />
                {material.latest_review.sensitive_items.length ? (
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                      敏感信息风险
                    </p>
                    <ul className="space-y-1">
                      {material.latest_review.sensitive_items.map((item) => (
                        <li key={`${item.label}-${item.reason}`}>
                          {item.label}：{item.handling} · {item.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <p className="rounded-md bg-muted p-3">
                  {material.latest_review.review_summary}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">尚未生成门下省驳议。</p>
            )}
          </Panel>
        </div>

        <aside className="space-y-4">
          <Panel title="用户朱批">
            <div className="grid gap-2">
              {[
                ["confirmed", "确认"],
                ["parked", "暂存"],
                ["rejected", "驳回"],
                ["summary_only", "仅保存脱敏摘要"],
                ["deleted", "删除原始材料"],
              ].map(([value, label]) => (
                <form action={setRealityMaterialDecision} key={value}>
                  <input type="hidden" name="material_id" value={material.id} />
                  <input type="hidden" name="decision" value={value} />
                  <button className="w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-muted">
                    {label}
                  </button>
                </form>
              ))}
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              朱批前不会进入现状、顾客、公司档案、Idea 或收束。
            </p>
          </Panel>

          <Panel title="4. 尚书省执行">
            {reviewBlocksRouting ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                门下省判断这份材料暂不应分流。可以先暂存、驳回，或补充材料后重跑审阅。
              </p>
            ) : canRoute ? (
              <form action={createRealityMaterialRoute} className="space-y-3">
                <input type="hidden" name="material_id" value={material.id} />
                <label className="block text-sm">
                  <span className="text-xs text-muted-foreground">分流目标</span>
                  <select
                    name="target"
                    className="mt-1 w-full rounded-md border bg-background px-3 py-2"
                    defaultValue="reality"
                  >
                    {MATERIAL_ROUTE_TARGETS.map((target) => (
                      <option key={target} value={target}>
                        {ROUTE_LABELS[target]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="text-xs text-muted-foreground">分流理由</span>
                  <textarea
                    name="reason"
                    required
                    rows={3}
                    className="mt-1 w-full rounded-md border bg-background px-3 py-2"
                    placeholder="为什么这条材料应该进入这个模块？"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-xs text-muted-foreground">期待产出</span>
                  <input
                    name="output_expectation"
                    required
                    className="mt-1 w-full rounded-md border bg-background px-3 py-2"
                    placeholder="例如：作为下一版现状地图的来源"
                  />
                </label>
                <button className="w-full rounded-md bg-foreground px-3 py-2 text-sm text-background">
                  记录分流
                </button>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">
                需要先确认或选择“仅保存脱敏摘要”，才能分流。
              </p>
            )}

            {material.routes.length ? (
              <div className="mt-4 border-t pt-4">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  已分流
                </p>
                <div className="space-y-2">
                  {material.routes.map((route) => {
                    const target = route.target as MaterialRouteTarget;
                    return (
                      <Link
                        key={route.id}
                        href={routeHref(target)}
                        className="block rounded-md border p-3 text-sm hover:bg-muted"
                      >
                        <span className="font-medium">
                          {ROUTE_LABELS[target]}
                        </span>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {route.reason}
                        </p>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="mb-4 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <ul className="list-disc space-y-1 pl-5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
