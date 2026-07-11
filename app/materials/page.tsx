import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, Inbox, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createRealityMaterial } from "./actions";
import { departmentLabel, routeTargetLabel } from "./domain";
import { getMaterialsSchemaReady, listRealityMaterials } from "./queries";

export const dynamic = "force-dynamic";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
  });
}

export default async function MaterialsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const schemaReady = await getMaterialsSchemaReady();
  const materials = schemaReady ? await listRealityMaterials(user.id) : [];
  const pending = materials.filter((item) =>
    ["reviewed", "failed", "extracted", "drafted"].includes(item.status)
  );
  const routed = materials.filter((item) => item.route_count > 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Reality materials
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            现实材料箱
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            先把现实丢进来。系统做中书起草、门下驳议，再由你朱批后分流到现状、顾客、公司、判断、行动或自我。
          </p>
        </div>
        <Link
          href="/workbench"
          className="rounded-md border px-3 py-2 text-xs text-muted-foreground hover:bg-muted"
        >
          回到决策工作台
        </Link>
      </header>

      {!schemaReady && (
        <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-950">
          现实材料箱数据库迁移尚未运行。请先运行
          <code className="mx-1 rounded bg-white px-1 py-0.5">
            029_reality_materials.sql
          </code>
          ；页面会保持可访问，不会让生产环境崩溃。
        </div>
      )}

      <section className="mb-8 rounded-xl border bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Inbox className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">把刚刚发生的现实丢进来</h2>
        </div>
        <form
          action={createRealityMaterial}
          encType="multipart/form-data"
          className="grid gap-4"
        >
          <div className="grid gap-3 md:grid-cols-[1fr_180px]">
            <input
              name="title"
              placeholder="可选标题，例如：供应商报价变化"
              className="rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <select
              name="source_type"
              defaultValue="text"
              className="rounded-lg border bg-background px-3 py-2 text-sm"
            >
              <option value="text">普通文本</option>
              <option value="url">URL</option>
              <option value="customer_quote">顾客话语</option>
              <option value="business_fragment">供应商/成本/财务</option>
              <option value="emotion_fragment">情绪/极限感</option>
            </select>
          </div>
          <textarea
            name="text"
            rows={7}
            placeholder="一句话也可以。可以粘贴顾客原话、供应商报价、成本片段、网页摘要、情绪信号或工作现场发生的事。"
            className="w-full resize-y rounded-lg border bg-background p-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="grid gap-3 md:grid-cols-2">
            <input
              name="source_url"
              type="url"
              placeholder="可选 URL"
              className="rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm text-muted-foreground">
              <Upload className="size-4" />
              <span>上传 TXT / MD / CSV / DOCX / XLSX / PDF</span>
              <input
                name="file"
                type="file"
                accept=".txt,.md,.markdown,.csv,.docx,.xlsx,.pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/pdf"
                className="sr-only"
              />
            </label>
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              AI 输出只会作为草稿；确认前不会写入现状、顾客证据、公司事实或 idea。
            </p>
            <button
              type="submit"
              disabled={!schemaReady}
              className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:cursor-not-allowed disabled:opacity-50"
            >
              进入三省审阅
            </button>
          </div>
        </form>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium">最近材料</h2>
            <span className="text-xs text-muted-foreground">
              {materials.length} 条
            </span>
          </div>
          {materials.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              还没有现实材料。先丢入一条顾客话语、成本片段或极限感。
            </div>
          ) : (
            <div className="space-y-3">
              {materials.map((material) => (
                <Link
                  key={material.id}
                  href={`/materials/${material.id}`}
                  className="block rounded-xl border bg-card p-4 hover:bg-muted/50"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <FileText className="size-4 text-muted-foreground" />
                        <h3 className="truncate text-sm font-medium">
                          {material.title}
                        </h3>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
                        {material.latest_draft?.summary ||
                          material.sanitized_text ||
                          "等待提取和审阅"}
                      </p>
                    </div>
                    <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                      {material.status}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>{fmtDate(material.updated_at)}</span>
                    {material.departments.map((department) => (
                      <span key={department}>· {departmentLabel(department)}</span>
                    ))}
                    {material.route_count > 0 && (
                      <span>· 已分流 {material.route_count}</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <SummaryCard title="待朱批" count={pending.length} />
          <SummaryCard title="已分流" count={routed.length} />
          <div className="rounded-xl border bg-card p-4">
            <h2 className="text-sm font-medium">六部出口</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              {[
                "customer",
                "company",
                "market",
                "judgment",
                "action",
                "self",
              ].map((department) => (
                <span key={department} className="rounded-md border px-2 py-1">
                  {departmentLabel(department as never)}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <h2 className="text-sm font-medium">可分流到</h2>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
              {[
                "reality",
                "customer_view",
                "company_kb",
                "idea",
                "retrospective",
                "reasoning",
                "decision_closure",
              ].map((target) => (
                <span key={target} className="rounded-md border px-2 py-1">
                  {routeTargetLabel(target as never)}
                </span>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function SummaryCard({ title, count }: { title: string; count: number }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="mt-2 text-2xl font-semibold">{count}</p>
    </div>
  );
}
