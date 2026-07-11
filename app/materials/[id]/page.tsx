import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  createRealityMaterialRoute,
  retryRealityMaterialAi,
  setRealityMaterialDecision,
} from "../actions";
import { departmentLabel, routeTargetLabel } from "../domain";
import { getRealityMaterial } from "../queries";

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

  const canRoute = ["confirmed", "summary_only"].includes(material.status);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/materials"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← 现实材料箱
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            {material.title}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            状态：{material.status} · 来源：{material.source_type}
          </p>
        </div>
        <form action={retryRealityMaterialAi}>
          <input type="hidden" name="material_id" value={material.id} />
          <button className="rounded-md border px-3 py-2 text-xs hover:bg-muted">
            重跑三省审阅
          </button>
        </form>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Section title="1. 原始材料">
            {material.source_url && (
              <p className="mb-3 text-xs text-muted-foreground">
                URL：
                <a
                  href={material.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  {material.source_url}
                </a>
              </p>
            )}
            {material.file_name && (
              <p className="mb-3 text-xs text-muted-foreground">
                文件：{material.file_name} · {material.file_size ?? 0} bytes
              </p>
            )}
            {material.redactions.length > 0 && (
              <p className="mb-3 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
                已遮蔽：{material.redactions.join(" / ")}
              </p>
            )}
            <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-4 text-sm leading-6">
              {material.sanitized_text || "没有可显示文本。"}
            </pre>
            {material.extraction?.unreadable.length ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                {material.extraction.unreadable.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            ) : null}
          </Section>

          <Section title="2. 中书省起草">
            {material.latest_draft ? (
              <div className="space-y-4">
                <Block label="摘要" items={[material.latest_draft.summary]} />
                <Block
                  label="原文片段"
                  items={material.latest_draft.original_fragments}
                />
                <Block
                  label="已确认事实"
                  items={material.latest_draft.confirmed_facts}
                />
                <Block
                  label="AI 推断"
                  items={material.latest_draft.possible_inferences}
                />
                <Block label="未知" items={material.latest_draft.unknowns} />
                <div className="flex flex-wrap gap-2 text-xs">
                  {material.departments.map((department) => (
                    <span key={department} className="rounded-full border px-2 py-1">
                      {departmentLabel(department)}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                还没有中书草稿。可重跑三省审阅。
              </p>
            )}
          </Section>

          <Section title="3. 门下省驳议">
            {material.latest_review ? (
              <div className="space-y-4">
                <Block
                  label="事实 / 推断边界"
                  items={material.latest_review.fact_inference_checks}
                />
                <Block
                  label="证据缺口"
                  items={material.latest_review.insufficient_evidence}
                />
                <Block
                  label="误导风险"
                  items={material.latest_review.misleading_risks}
                />
                <Block
                  label="禁止自动写入"
                  items={material.latest_review.blocked_auto_writes}
                />
                {material.latest_review.sensitive_items.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-xs font-medium text-muted-foreground">
                      敏感信息
                    </h3>
                    <ul className="space-y-2">
                      {material.latest_review.sensitive_items.map((item) => (
                        <li key={`${item.label}:${item.reason}`} className="rounded-md border p-3 text-sm">
                          {item.label} · {item.handling}
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.reason}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="rounded-md bg-muted p-3 text-sm">
                  {material.latest_review.review_summary}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                还没有门下驳议。可重跑三省审阅。
              </p>
            )}
          </Section>
        </div>

        <aside className="space-y-6">
          <Section title="用户朱批">
            <div className="grid grid-cols-2 gap-2">
              {[
                ["confirmed", "确认"],
                ["parked", "暂存"],
                ["rejected", "驳回"],
                ["summary_only", "仅保存脱敏摘要"],
              ].map(([decision, label]) => (
                <form key={decision} action={setRealityMaterialDecision}>
                  <input type="hidden" name="material_id" value={material.id} />
                  <input type="hidden" name="decision" value={decision} />
                  <button className="w-full rounded-md border px-3 py-2 text-xs hover:bg-muted">
                    {label}
                  </button>
                </form>
              ))}
            </div>
          </Section>

          <Section title="4. 尚书省执行">
            {!canRoute && (
              <p className="mb-3 rounded-md bg-amber-50 p-2 text-xs text-amber-950">
                需要先朱批确认，才能分流。AI 草稿不会自动进入其他模块。
              </p>
            )}
            <div className="space-y-2">
              {(material.latest_draft?.suggested_routes ?? []).map((route) => (
                <form
                  key={`${route.target}:${route.reason}`}
                  action={createRealityMaterialRoute}
                  className="rounded-lg border p-3"
                >
                  <input type="hidden" name="material_id" value={material.id} />
                  <input type="hidden" name="target" value={route.target} />
                  <input type="hidden" name="reason" value={route.reason} />
                  <input
                    type="hidden"
                    name="output_expectation"
                    value={route.payload_hint}
                  />
                  <p className="text-sm font-medium">
                    {routeTargetLabel(route.target)}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {route.reason}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    产出：{route.payload_hint}
                  </p>
                  <button
                    disabled={!canRoute}
                    className="mt-3 rounded-md bg-foreground px-3 py-1.5 text-xs text-background disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    记录分流
                  </button>
                </form>
              ))}
              {!material.latest_draft?.suggested_routes.length && (
                <p className="text-sm text-muted-foreground">
                  还没有分流候选。
                </p>
              )}
            </div>
          </Section>

          <Section title="已执行分流">
            {material.routes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                尚未分流到任何模块。
              </p>
            ) : (
              <ul className="space-y-2">
                {material.routes.map((route) => (
                  <li key={route.id} className="rounded-md border p-3 text-sm">
                    <p className="font-medium">
                      {routeTargetLabel(route.target as never)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {route.reason}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </aside>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="mb-4 text-sm font-medium">{title}</h2>
      {children}
    </section>
  );
}

function Block({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="mb-2 text-xs font-medium text-muted-foreground">{label}</h3>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item} className="rounded-md border bg-background p-2 text-sm">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
