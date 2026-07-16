import { notFound } from "next/navigation";
import Link from "next/link";
import { BookOpen, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { listCompanyKbFacts, listCompanyKbNotes } from "./queries";
import { FactsPanel } from "./facts-panel";

export const dynamic = "force-dynamic";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
  });
}

export default async function CompanyKbPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const [notes, facts] = await Promise.all([
    listCompanyKbNotes(user.id),
    listCompanyKbFacts(user.id),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-8 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <BookOpen className="h-5 w-5 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">公司知识库</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              自己公司的沉淀——自由笔记和结构化事实，跟顾客/市场的通用知识库分开。
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Link
            href="/company-kb/new"
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-foreground px-3 text-sm font-medium text-background"
          >
            <Plus className="h-4 w-4" />
            新建笔记
          </Link>
          <Link
            href="/materials"
            className="text-[11px] text-muted-foreground underline-offset-4 hover:underline"
          >
            外部材料（网页/文件/原话）走材料箱 →
          </Link>
        </div>
      </div>

      <section className="mb-10">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          公司事实
        </h2>
        <FactsPanel initialFacts={facts} />
      </section>

      <section>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          笔记
        </h2>
        {notes.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            还没有笔记。团队信息、产品文档、会议纪要，什么都能记。
          </p>
        ) : (
          <ul className="space-y-2">
            {notes.map((note) => (
              <li key={note.id}>
                <Link
                  href={`/company-kb/${note.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border bg-card p-4 hover:bg-muted"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{note.title}</p>
                    {note.content && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {note.content}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {fmtDate(note.updated_at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
