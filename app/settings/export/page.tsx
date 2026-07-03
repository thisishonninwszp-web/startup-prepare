import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ExportButton } from "./export-button";

export const dynamic = "force-dynamic";

export default async function ExportPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-1 text-xl font-semibold tracking-tight">数据导出</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        导出你的核心决策数据（想法、假设、验证记录、预测、决策），按想法分组的一份 JSON 文件。
        不含 AI 对话记录、顾客研究、复盘、梦想、推理工具、顾问团等其他模块——如果需要更完整的备份，
        以后可以再扩展。
      </p>
      <ExportButton />
    </div>
  );
}
