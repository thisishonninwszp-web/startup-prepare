import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { setRealityMaterialDecision } from "../actions";
import {
  getMaterialsSchemaAvailable,
  getRealityMaterial,
  listRealityMaterials,
} from "../queries";
import { DEPARTMENT_LABELS, SOURCE_LABELS } from "../material-labels";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

/**
 * 批阅模式：一次只呈一件，批完自动呈下一件。
 * 折子式的全屏审阅——只有三个动作：准 / 驳 / 留中。
 */
export default async function MaterialReviewPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const schemaAvailable = await getMaterialsSchemaAvailable();
  if (!schemaAvailable) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-10 text-sm text-muted-foreground">
        现实材料箱数据库迁移尚未运行，无法批阅。
      </div>
    );
  }

  const all = await listRealityMaterials(user.id);
  // 待朱批队列：最早进入的先批（奏折按呈递顺序）。
  const pendingList = all
    .filter((item) => item.status === "reviewed")
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  if (pendingList.length === 0) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-6 text-center">
        <p className="font-serif text-2xl">今日折子已批完</p>
        <p className="mt-3 text-sm text-muted-foreground">
          没有等待朱批的材料。批过的东西才算进了系统，去现实里收集下一批。
        </p>
        <Link
          href="/materials"
          className="mt-6 text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          ← 返回现实材料箱
        </Link>
      </div>
    );
  }

  const material = await getRealityMaterial(user.id, pendingList[0].id);
  if (!material) notFound();
  const draft = material.latest_draft;
  const review = material.latest_review;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <Link
          href="/materials"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← 退出批阅
        </Link>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          待批 {pendingList.length} 件 · 现呈第 1 件
        </span>
      </div>

      <article className="animate-fade-up rounded-lg border bg-card px-6 py-8 sm:px-10">
        <p className="text-center font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
          {SOURCE_LABELS[material.source_type]} ·{" "}
          {new Date(material.created_at).toLocaleDateString("zh-CN")}
        </p>
        <h1 className="mt-3 text-center font-serif text-xl tracking-tight">
          {material.title}
        </h1>

        {draft?.summary && (
          <p className="mx-auto mt-6 max-w-xl text-center text-sm leading-relaxed">
            {draft.summary}
          </p>
        )}

        <div className="mt-6 max-h-64 overflow-auto rounded-lg bg-muted p-4">
          <pre className="whitespace-pre-wrap text-sm leading-6">
            {material.sanitized_text || "暂无脱敏文本"}
          </pre>
        </div>

        {draft && (
          <div className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
            {draft.confirmed_facts.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  已确认事实
                </p>
                <ul className="list-disc space-y-1 pl-5">
                  {draft.confirmed_facts.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {draft.possible_inferences.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  AI 推断（非事实）
                </p>
                <ul className="list-disc space-y-1 pl-5">
                  {draft.possible_inferences.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {review && (
          <div className="mt-6 rounded-lg border border-status-validating/30 bg-status-validating/10 p-4 text-sm text-status-validating">
            <p className="text-xs font-medium">门下省驳议</p>
            <p className="mt-1 leading-relaxed">{review.review_summary}</p>
            {review.misleading_risks.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                {review.misleading_risks.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {draft && draft.suggested_departments.length > 0 && (
          <div className="mt-6 flex flex-wrap justify-center gap-1.5">
            {draft.suggested_departments.map((department) => (
              <span
                key={department}
                className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground"
              >
                拟归 {DEPARTMENT_LABELS[department]}
              </span>
            ))}
          </div>
        )}

        <div className="mt-8 grid grid-cols-3 gap-3 border-t pt-6">
          <form action={setRealityMaterialDecision}>
            <input type="hidden" name="material_id" value={material.id} />
            <input type="hidden" name="decision" value="confirmed" />
            <Button className="w-full rounded-lg bg-foreground px-4 py-3 font-serif text-lg text-background transition-transform hover:-translate-y-0.5">
              准
            </Button>
          </form>
          <form action={setRealityMaterialDecision}>
            <input type="hidden" name="material_id" value={material.id} />
            <input type="hidden" name="decision" value="rejected" />
            <Button className="w-full rounded-lg border border-destructive/40 px-4 py-3 font-serif text-lg text-destructive transition-transform hover:-translate-y-0.5">
              驳
            </Button>
          </form>
          <form action={setRealityMaterialDecision}>
            <input type="hidden" name="material_id" value={material.id} />
            <input type="hidden" name="decision" value="parked" />
            <Button className="w-full rounded-lg border px-4 py-3 font-serif text-lg text-muted-foreground transition-transform hover:-translate-y-0.5">
              留中
            </Button>
          </form>
        </div>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          准 = 确认可分流 · 驳 = 驳回 · 留中 = 暂存再议。要细看全文或分流，
          <Link href={`/materials/${material.id}`} className="underline underline-offset-4">
            进入详情页
          </Link>
          。
        </p>
      </article>
    </div>
  );
}
