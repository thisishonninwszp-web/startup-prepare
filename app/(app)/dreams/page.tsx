import Link from "next/link";
import { ArrowRight, CloudMoon, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { listDreamCases } from "./queries";
import { DreamDeleteButton } from "./dream-delete-button";

export const dynamic = "force-dynamic";

const CONTEXT_LABEL = {
  personal: "人生",
  business: "事业",
  cross: "人生／事业交叉",
} as const;
const SCALE_LABEL = {
  small: "小梦 · 1年内",
  big: "大梦 · 3–5年",
  grand: "宏大梦 · 10年以上",
} as const;

export default async function DreamsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const cases = await listDreamCases(user!.id);
  return (
    <>
      <main className="min-h-screen bg-background text-foreground">
        <section className="relative overflow-hidden border-b border-border/70 px-4 py-12 sm:px-8 lg:px-12">
          <div className="absolute -right-24 -top-24 size-80 rounded-full border border-border/60" />
          <div className="absolute -right-8 -top-8 size-48 rounded-full border border-border/60" />
          <div className="relative mx-auto flex max-w-6xl flex-col gap-8 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                <CloudMoon className="size-4" />
                Future archive
              </div>
              <h1 className="mt-5 max-w-3xl font-serif text-4xl leading-tight tracking-[-0.04em] sm:text-5xl">
                先允许未来变得具体，
                <br />
                再看它靠什么成立。
              </h1>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-muted-foreground">
                不把梦想压成任务。先看见某一天的光线、人物、动作和内心，再折叠查看代价与前提。
              </p>
            </div>
            <Link
              href="/dreams/new"
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-foreground px-5 text-sm text-background"
            >
              <Plus className="size-4" />
              开始做一个梦
            </Link>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-10 sm:px-8 lg:px-12">
          {cases.length === 0 ? (
            <div className="rounded-lg border border-dashed border-foreground/30/70 p-12 text-center">
              <p className="font-serif text-xl">这里还没有未来画面。</p>
              <p className="mt-3 text-sm text-muted-foreground">
                不必先证明现实可行，只要从“我想看见怎样的一天”开始。
              </p>
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2">
              {cases.map((item, index) => (
                <div
                  key={item.id}
                  className={
                    "group relative min-h-64 overflow-hidden rounded-lg border border-border bg-muted/50 transition-transform hover:-translate-y-1 " +
                    (index % 3 === 0 ? "md:col-span-2 md:min-h-72" : "")
                  }
                >
                  <DreamDeleteButton caseId={item.id} />
                  <div className="absolute right-5 top-3 font-serif text-7xl text-background/70">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                <Link
                  href={`/dreams/${item.id}`}
                  className="relative block h-full p-6"
                >
                  <div className="flex h-full flex-col">
                    <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                      <span className="rounded-full border border-border px-2 py-1">
                        {CONTEXT_LABEL[item.context]}
                      </span>
                      <span className="rounded-full border border-border px-2 py-1">
                        {SCALE_LABEL[item.scale]}
                      </span>
                    </div>
                    <h2 className="mt-8 max-w-2xl font-serif text-2xl leading-snug">
                      {item.title}
                    </h2>
                    <p className="mt-3 max-w-2xl line-clamp-2 text-sm leading-6 text-muted-foreground">
                      {item.initial_desire}
                    </p>
                    <div className="mt-auto flex items-center justify-between pt-8 text-xs text-muted-foreground">
                      <span>
                        {item.branch_count} 条路径 · {item.version_count} 个愿景版本
                      </span>
                      <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                    </div>
                  </div>
                </Link>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
