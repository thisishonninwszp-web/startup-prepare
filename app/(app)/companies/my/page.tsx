import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, FileSpreadsheet, LockKeyhole } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  getOwnCompanyProfile,
  listBusinessPlanImports,
} from "./queries";
import { ProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";

const STATUS_LABELS = {
  uploading: "上传中",
  extracting: "待分析",
  awaiting_confirmation: "待确认",
  completed: "已完成",
  failed: "需要重试",
} as const;

export default async function OwnCompanyPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await getOwnCompanyProfile(user.id);
  const imports = profile
    ? await listBusinessPlanImports(user.id, profile.id)
    : [];

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <Link
        href="/companies"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        公司档案
      </Link>

      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">我的公司</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            私有经营计划档案，与目标公司资料完全分离。
          </p>
        </div>
        {profile ? (
          <Link
            href="/companies/my/import"
            className="shrink-0 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background"
          >
            导入经营计划
          </Link>
        ) : null}
      </div>

      <section className="rounded-lg border bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <LockKeyhole className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-medium">内部档案</h2>
        </div>
        <ProfileForm initialName={profile?.display_name} />
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium">经营计划版本</h2>
        {!profile ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            先建立“我的公司”档案，再导入经营计划。
          </p>
        ) : imports.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <FileSpreadsheet className="mx-auto h-5 w-5 text-muted-foreground" />
            <p className="mt-3 text-sm">还没有经营计划版本</p>
            <p className="mt-1 text-xs text-muted-foreground">
              原始 Excel 只在浏览器本地解析，不会上传。
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {imports.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-lg border bg-card p-4"
              >
                <div>
                  <p className="text-sm font-medium">
                    v{item.version_no} · {item.file_name}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.visible_sheet_count} 个可见工作表 · {item.chunk_count} 个脱敏分块
                  </p>
                </div>
                <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                  {STATUS_LABELS[item.status]}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
