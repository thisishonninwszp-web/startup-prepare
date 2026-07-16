import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FirstPrinciplesForm } from "./first-principles-form";
import { PageContainer } from "@/components/ui/page-container";

export const dynamic = "force-dynamic";

export default async function NewFirstPrinciplesPage({
  searchParams,
}: {
  searchParams: Promise<{ idea_id?: string; claim?: string }>;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const params = await searchParams;
  const ideaId = params.idea_id ?? null;
  const preClaim = params.claim ?? "";

  return (
    <PageContainer width="narrow">
      <h1 className="mb-1 text-xl font-semibold tracking-tight">第一性原理分解</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        输入一个你相信的命题——AI 会把它拆到底层，找出哪些是真正站得住脚的，哪些只是沙滩。
      </p>
      <FirstPrinciplesForm ideaId={ideaId} preClaim={preClaim} />
    </PageContainer>
  );
}
