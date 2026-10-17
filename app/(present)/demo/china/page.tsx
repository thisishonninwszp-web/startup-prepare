import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { StartForm } from "./start-form";

export const dynamic = "force-dynamic";
// 新开一次时在 server action 里先写搜索词（几秒）
export const maxDuration = 60;

/** 只有输入框；跑过的记录列在 /jobs（这一页会共享给面试官看）。 */
export default async function ChinaLensPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  return (
    <PageContainer>
      <p className="mb-6 text-right text-xs">
        <Link href="/jobs" className="text-muted-foreground transition-colors duration-150 hover:text-foreground">
          戻る
        </Link>
      </p>
      <PageHeader
        eyebrow="Demo"
        title="御社の商売、中国ではどうなっている？"
        description="御社の商売をひとことで書くと、中国で同じ商売をしている会社を中国語で探して、原文と訳を並べます。そのあと、中国でうまくいった条件が日本にもあるかを、日本の資料で確かめます。"
      />
      <StartForm />
    </PageContainer>
  );
}
