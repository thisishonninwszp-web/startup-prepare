import Link from "next/link";
import type { DecisionClosure } from "@/lib/domains/closures/domain";
import type { WorkbenchDetail } from "./queries";
import { ClosureResultForm } from "./closure-result-form";

export function ObjectSummary({
  detail,
  today,
}: {
  detail: WorkbenchDetail;
  today: string;
}) {
  const active = detail.object.current_closure;
  const due = Boolean(active && active.due_on <= today);
  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Decision object
          </p>
          <h1 className="mt-1 text-xl font-semibold">{detail.object.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            来源模块：{detail.object.primary_module}
          </p>
        </div>
        <Link
          href={detail.object.href}
          className="rounded-md border px-3 py-2 text-xs hover:bg-muted"
        >
          回原模块查看
        </Link>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border bg-background p-4">
          <p className="text-xs text-muted-foreground">当前状态</p>
          {active ? (
            <>
              <p className="mt-2 text-sm font-medium">
                {active.selected_next_step}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                对账日：{active.due_on}
                {due ? "（已到期）" : ""}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              当前没有 active 统一收束。
            </p>
          )}
        </div>
        <div className="rounded-lg border bg-background p-4">
          <p className="text-xs text-muted-foreground">证据与来源</p>
          {detail.evidence.length > 0 ? (
            <ul className="mt-2 space-y-2 text-sm">
              {detail.evidence.map((item) => (
                <li key={`${item.label}-${item.href}`}>
                  <Link href={item.href} className="underline underline-offset-4">
                    {item.label}
                  </Link>
                  <p className="text-xs text-muted-foreground">{item.text}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              第一版只展示基础来源。更详细证据请回原模块查看。
            </p>
          )}
        </div>
      </div>

      {active && due && (
        <div className="mt-5 rounded-lg border border-orange-300 bg-orange-50 p-4">
          <h2 className="text-sm font-medium text-orange-950">结果学习</h2>
          <p className="mt-1 text-xs text-orange-800">
            这一步已经到期。先对账，再决定是否创建新的收束。
          </p>
          <ClosureResultForm
            closure={active}
            objectType={active.object_type}
            objectId={active.object_id}
          />
        </div>
      )}

      {detail.learnings.length > 0 && (
        <div className="mt-5 rounded-lg border bg-background p-4">
          <h2 className="text-sm font-medium">历史学习</h2>
          <ul className="mt-3 space-y-3">
            {detail.learnings.map((learning) => (
              <li key={learning.id} className="text-sm">
                <p>{learning.actual_result}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  原因：{learning.gap_reason}
                  {learning.updated_rule ? ` · 规则：${learning.updated_rule}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function ClosureList({ closures }: { closures: DecisionClosure[] }) {
  if (closures.length === 0) return null;
  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="text-lg font-medium">统一收束历史</h2>
      <ul className="mt-4 space-y-2">
        {closures.map((closure) => (
          <li key={closure.id} className="rounded-lg border bg-background p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {closure.status} · {closure.due_on}
              </span>
            </div>
            <p className="mt-2 text-sm">{closure.selected_next_step}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
