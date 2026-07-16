import Link from "next/link";
import { ArrowRight, CalendarClock, Plus, ScanSearch } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { listRealityCases } from "./queries";
import { listActiveRealityClosureDueDates } from "./closure-queries";
import { isClosureDue } from "./closure";
import { todayInTimezone } from "@/app/(app)/retrospectives/queries";
import { PageContainer } from "@/components/ui/page-container";

export const dynamic = "force-dynamic";

const CONTEXT_LABEL = {
  personal: "人生",
  business: "事业",
  cross: "人生 × 事业",
} as const;

export default async function RealityPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [cases, closureDueDates] = await Promise.all([
    listRealityCases(user!.id),
    listActiveRealityClosureDueDates(user!.id),
  ]);
  const closureDueByCase = new Map(
    closureDueDates.map((item) => [item.case_id, item.due_on])
  );
  const now = Date.now();
  const today = todayInTimezone("Asia/Tokyo");
  const due = cases
    .map((item) => ({
      ...item,
      closure_due_on: closureDueByCase.get(item.id) ?? null,
    }))
    .filter((item) => {
      if (item.closure_due_on) {
        return isClosureDue(item.closure_due_on, today);
      }
      return (
        item.review_due_at &&
        new Date(item.review_due_at).getTime() <= now
      );
    });

  return (
    <>
      <main className="min-h-screen">
        <section className="bg-dotgrid border-b px-4 py-10 sm:px-8 lg:px-12">
          <div className="mx-auto flex max-w-4xl flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                <ScanSearch className="size-4" />
                Reality system
              </div>
              <h1 className="mt-5 max-w-2xl text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
                先把现实看清，再问下一步。
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">
                分开事实、解释、未知与情绪。不是让AI替你决定，而是让含混的处境变成可以更新的地图。
              </p>
            </div>
            <Link
              href="/reality/new"
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-transform active:scale-[0.98]"
            >
              <Plus className="size-4" />
              新建现状课题
            </Link>
          </div>
        </section>

        <PageContainer width="default" className="lg:px-12">
          {due.length > 0 && (
            <section className="mb-10">
              <div className="mb-3 flex items-center gap-2">
                <CalendarClock className="size-4 text-status-validating" />
                <h2 className="text-sm font-medium">该重新看一眼了</h2>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {due.map((item) => (
                  <Link
                    key={item.id}
                    href={`/reality/${item.id}`}
                    className="group rounded-lg border border-status-validating/30 bg-status-validating/10 p-4 text-status-validating transition-transform hover:-translate-y-0.5"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-medium">{item.title}</div>
                        <p className="mt-1 text-xs text-status-validating">
                          {item.closure_due_on ? "下一步到期：" : "复查日："}
                          {new Date(
                            item.closure_due_on ?? item.review_due_at!
                          ).toLocaleDateString("zh-CN")}
                        </p>
                      </div>
                      <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-sm font-medium">现状课题</h2>
              <span className="font-mono text-xs text-muted-foreground">
                {cases.length} CASES
              </span>
            </div>

            {cases.length === 0 ? (
              <div className="rounded-lg border border-dashed p-10 text-center">
                <p className="text-sm">还没有现状课题。</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  从一个你反复在想、却一直没有看清的问题开始。
                </p>
              </div>
            ) : (
              <div className="divide-y border-y">
                {cases.map((item) => (
                  <Link
                    key={item.id}
                    href={`/reality/${item.id}`}
                    className="group grid gap-3 py-5 transition-colors hover:bg-muted/40 sm:grid-cols-[1fr_auto] sm:px-3"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-medium">
                          {item.title}
                        </h3>
                        <span className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">
                          {item.mode === "global" ? "全局扫描" : "具体课题"}
                        </span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                          {CONTEXT_LABEL[item.context]}
                        </span>
                      </div>
                      {item.domains.length > 0 && (
                        <p className="mt-2 truncate text-xs text-muted-foreground">
                          {item.domains.join(" · ")}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {new Date(item.updated_at).toLocaleDateString("zh-CN")}
                      <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </PageContainer>
      </main>
    </>
  );
}
