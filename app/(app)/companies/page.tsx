import Link from "next/link";
import { Plus, Building2, LockKeyhole } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { listCompanies } from "@/app/(app)/knowledge/queries";
import { COMPANY_TYPES, type CompanyType } from "@/app/(app)/knowledge/types";
import { PageContainer } from "@/components/ui/page-container";

export const dynamic = "force-dynamic";

const TYPE_COLORS: Record<CompanyType, string> = {
  prospect: "bg-status-hypothesis/10 text-status-hypothesis border-status-hypothesis/30",
  customer: "bg-status-mvp/10 text-status-mvp border-status-mvp/30",
  both: "bg-verdict-learned/10 text-verdict-learned border-verdict-learned/30",
};

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: { type?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const activeType = COMPANY_TYPES.find((t) => t.key === searchParams.type)?.key;
  const companies = await listCompanies(user!.id, activeType);

  return (
    <PageContainer width="default">
      <div className="mb-8 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Building2 className="h-5 w-5 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">公司档案</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              求职目标或目标客户的结构化档案，含 CEO 思路和大事记
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/company-kb"
            className="flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            公司知识库
          </Link>
          <Link
            href="/companies/new"
            className="flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background"
          >
            <Plus className="h-4 w-4" />
            添加
          </Link>
        </div>
      </div>

      <Link
        href="/companies/my"
        className="mb-6 block rounded-lg border border-border bg-foreground p-5 text-background transition-colors hover:bg-foreground"
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
    </PageContainer>
  );
}
