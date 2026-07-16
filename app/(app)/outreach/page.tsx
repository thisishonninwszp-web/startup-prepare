import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listCanvases } from "./queries";
import { USE_CASES } from "./types";

export const dynamic = "force-dynamic";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
  });
}

export default async function OutreachPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user!.id;

  const canvases = await listCanvases(userId);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">触达规划</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            人生无处不营销。四维框架帮你想清楚：对的人 × 对的地方 × 对的时机 × 对的信息。
          </p>
        </div>
        <Link
          href="/outreach/new"
          className="shrink-0 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background"
        >
          + 新建画布
        </Link>
      </div>

      {/* 场景快速入口 */}
      <section className="mb-10">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          快速开始
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {USE_CASES.map((uc) => (
            <Link
              key={uc.key}
              href={`/outreach/new?use_case=${uc.key}`}
              className="group rounded-lg border p-3 transition-colors hover:border-foreground/30 hover:bg-muted/30"
            >
              <p className="text-sm font-medium">{uc.label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{uc.hint}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* 已有画布列表 */}
      {canvases.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            已有画布（{canvases.length}）
          </h2>
          <div className="space-y-2">
            {canvases.map((c) => {
              const ucLabel = USE_CASES.find((u) => u.key === c.use_case)?.label ?? c.use_case;
              const filled = [c.person_notes, c.place_notes, c.time_notes, c.message_draft].filter(
                Boolean
              ).length;
              return (
                <Link
                  key={c.id}
                  href={`/outreach/${c.id}`}
                  className="flex items-center gap-4 rounded-lg border px-4 py-3 transition-colors hover:bg-muted/30"
                >
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium">{c.title}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {ucLabel}
                      {c.scenario ? ` · ${c.scenario.slice(0, 40)}${c.scenario.length > 40 ? "…" : ""}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-muted-foreground">{fmtDate(c.updated_at)}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground/60">
                      {filled}/4 维度已填
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {canvases.length === 0 && (
        <p className="text-sm text-muted-foreground">
          还没有画布。选一个场景开始思考。
        </p>
      )}
    </div>
  );
}
