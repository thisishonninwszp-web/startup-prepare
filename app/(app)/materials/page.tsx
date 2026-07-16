import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, Inbox } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  getMaterialsSchemaAvailable,
  listRealityMaterials,
} from "./queries";
import { MaterialInput } from "./material-input";
import {
  DEPARTMENT_LABELS,
  SOURCE_LABELS,
  STATUS_LABELS,
} from "./material-labels";

export const dynamic = "force-dynamic";

function preview(text: string | null): string {
  if (!text) return "暂无可预览文本";
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}

export default async function MaterialsPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  // Share Target 分享 URL 进来时预填抽取框。
  const sharedUrl =
    typeof searchParams.url === "string" ? searchParams.url : "";
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const schemaAvailable = await getMaterialsSchemaAvailable();
  const materials = schemaAvailable ? await listRealityMaterials(user.id) : [];
  const pending = materials.filter((item) => item.status === "reviewed");
  const routed = materials.filter((item) =>
    ["confirmed", "summary_only"].includes(item.status)
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Reality material inbox
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          现实材料箱
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          所有现实先进入这里：材料被提取、起草、质疑，再由你确认后分流到现状、顾客、公司、判断、行动或自我。
        </p>
      </header>

      {!schemaAvailable ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
          现实材料箱数据库迁移尚未运行。请先执行
          <code className="mx-1 rounded bg-amber-100 px-1">
            029_reality_materials.sql
          </code>
          ，现有页面不会崩溃。
        </div>
      ) : (
        <>
          <MaterialInput initialUrl={sharedUrl} />

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {pending.length > 0 ? (
              <Link
                href="/materials/review"
                className="rounded-xl border border-red-300 bg-red-50 p-4 transition-colors hover:bg-red-100"
              >
                <p className="text-[10px] font-medium uppercase tracking-wider text-red-700">
                  待朱批
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-red-900">
                  {pending.length}
                </p>
                <p className="mt-0.5 text-xs text-red-700">进入批阅模式 →</p>
              </Link>
            ) : (
              <StatCard label="待朱批" value={pending.length} />
            )}
            <StatCard label="已确认 / 仅摘要" value={routed.length} />
            <StatCard label="全部材料" value={materials.length} />
          </div>

          <section className="mt-8">
            <div className="mb-4 flex items-center gap-2">
              <Inbox className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-medium">最近材料</h2>
            </div>
            {materials.length === 0 ? (
              <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                还没有材料。先把一段真实发生的事情丢进来。
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {materials.map((item) => (
                  <Link
                    key={item.id}
                    href={`/materials/${item.id}`}
                    className="rounded-xl border bg-card p-4 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {item.title}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {SOURCE_LABELS[item.source_type]} ·{" "}
                          {STATUS_LABELS[item.status]}
                        </p>
                      </div>
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </div>
                    <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">
                      {preview(item.sanitized_text)}
                    </p>
                    {item.departments.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {item.departments.map((department) => (
                          <span
                            key={department}
                            className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground"
                          >
                            {DEPARTMENT_LABELS[department]}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
