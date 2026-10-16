import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { listCareerEntries } from "@/lib/domains/jobs/base";
import { MISSING_MIGRATION } from "@/lib/domains/jobs/profile";
import { BaseWorkbench } from "./base-workbench";

export const dynamic = "force-dynamic";
// AI 整理一条要十来秒
export const maxDuration = 60;

export default async function CareerBasePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();
  const entries = await listCareerEntries(user.id);

  return (
    <PageContainer width="narrow">
      <p className="mb-4 text-sm">
        <Link href="/jobs" className="text-muted-foreground transition-colors duration-150 hover:text-foreground">
          ← 求职
        </Link>
      </p>
      <PageHeader
        title="底稿"
        description="以后每一版简历都只从这里取。用你自己的话写，中文就行；整理成日文以后，你改完点确认才算数。日文稿里出现你原话里没有的数字或英文词，那一句会被删掉。"
      />
      {entries === "missing-schema" ? (
        <p className="text-sm leading-7 text-muted-foreground">{MISSING_MIGRATION}</p>
      ) : (
        <BaseWorkbench entries={entries} />
      )}
    </PageContainer>
  );
}
