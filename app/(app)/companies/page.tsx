import Link from "next/link";
import { Plus, Building2, LockKeyhole, BookOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { listCompanies } from "@/app/(app)/knowledge/queries";
import { COMPANY_TYPES, type CompanyType } from "@/app/(app)/knowledge/types";
import {
  listCompanyKbFacts,
  listCompanyKbNotes,
} from "@/app/(app)/company-kb/queries";
import { FactsPanel } from "@/app/(app)/company-kb/facts-panel";
import { PageContainer } from "@/components/ui/page-container";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const dynamic = "force-dynamic";

const TYPE_COLORS: Record<CompanyType, string> = {
  prospect: "bg-status-hypothesis/10 text-status-hypothesis border-status-hypothesis/30",
  customer: "bg-status-mvp/10 text-status-mvp border-status-mvp/30",
  both: "bg-verdict-learned/10 text-verdict-learned border-verdict-learned/30",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
  });
}

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: { type?: string; tab?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const activeType = COMPANY_TYPES.find((t) => t.key === searchParams.type)?.key;
  const [companies, kbNotes, kbFacts] = await Promise.all([
    listCompanies(user!.id, activeType),
    listCompanyKbNotes(user!.id),
    listCompanyKbFacts(user!.id),
  ]);

  return (
    <PageContainer width="default">
      <div className="mb-8 flex items-center gap-3">
        <Building2 className="h-5 w-5 text-muted-foreground" />
        <div>
          <h1 className="text-xl font-semibold tracking-tight">公司档案</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            求职目标或目标客户的结构化档案，与自己公司的知识沉淀
          </p>
        </div>
      </div>

      <Tabs defaultValue={searchParams.tab === "kb" ? "kb" : "external"}>
        <TabsList>
          <TabsTrigger value="external">客户与求职目标</TabsTrigger>
          <TabsTrigger value="kb">公司知识库</TabsTrigger>
        </TabsList>

        <TabsContent value="external">
          <div className="mb-6 mt-4 flex items-start justify-between">
            <Link
              href="/companies/my"
              className="block flex-1 rounded-lg border border-border bg-foreground p-5 text-background transition-colors hover:bg-foreground"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <LockKeyhole className="h-4 w-4" />
                    <p className="font-medium">我的公司 · 内部档案</p>
                  </div>
                  <p className="mt-2 text-sm text-background/80">
                    在浏览器本地读取并脱敏经营计划，与下方外部公司档案分开保存。
                  </p>
                </div>
                <span className="shrink-0 text-sm text-muted-foreground/80">进入 →</span>
              </div>
            </Link>
            <Link
              href="/companies/new"
              className="ml-3 flex shrink-0 items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background"
            >
              <Plus className="h-4 w-4" />
              添加
            </Link>
          </div>

          {/* 类型筛选 */}
          <div className="mb-6 flex flex-wrap gap-2">
            <Link
              href="/companies"
              className={`rounded-full border px-3 py-1 text-xs ${
                !activeType
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:border-foreground"
              }`}
            >
              全部
            </Link>
            {COMPANY_TYPES.map((t) => (
              <Link
                key={t.key}
                href={`/companies?type=${t.key}`}
                className={`rounded-full border px-3 py-1 text-xs ${
                  activeType === t.key
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:border-foreground"
                }`}
              >
                {t.label}
              </Link>
            ))}
          </div>

          {companies.length === 0 ? (
            <div className="rounded-lg border border-dashed p-10 text-center">
              <p className="text-sm text-muted-foreground">
                {activeType ? `暂无${COMPANY_TYPES.find((t) => t.key === activeType)?.label}档案` : "还没有公司档案"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                记录求职目标或目标客户的背景信息、CEO 思路……
              </p>
              <Link
                href="/companies/new"
                className="mt-4 inline-flex items-center gap-1 text-sm underline underline-offset-4"
              >
                <Plus className="h-3.5 w-3.5" />
                添加第一个公司档案
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {companies.map((company) => {
                const typeInfo = COMPANY_TYPES.find((t) => t.key === company.company_type);
                return (
                  <Link
                    key={company.id}
                    href={`/companies/${company.id}`}
                    className="block rounded-lg border bg-card p-4 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <p className="font-medium">{company.name}</p>
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${TYPE_COLORS[company.company_type]}`}
                      >
                        {typeInfo?.label ?? company.company_type}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="kb">
          <div className="mb-6 mt-4 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <BookOpen className="h-5 w-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                自己公司的沉淀——自由笔记和结构化事实，跟顾客/市场的通用知识库分开。
                外部材料（网页/文件/原话）走{" "}
                <Link href="/materials" className="underline underline-offset-4">
                  材料箱
                </Link>
                。
              </p>
            </div>
            <Link
              href="/company-kb/new"
              className="ml-3 flex shrink-0 items-center gap-2 rounded-lg bg-foreground px-3 py-1.5 text-sm font-medium text-background"
            >
              <Plus className="h-4 w-4" />
              新建笔记
            </Link>
          </div>

          <section className="mb-10">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              公司事实
            </h2>
            <FactsPanel initialFacts={kbFacts} />
          </section>

          <section>
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              笔记
            </h2>
            {kbNotes.length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                还没有笔记。团队信息、产品文档、会议纪要，什么都能记。
              </p>
            ) : (
              <ul className="space-y-2">
                {kbNotes.map((note) => (
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
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
