import { ReframingForm } from "./reframing-form";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
import { loadOwnedRealityReasoningSnapshot } from "../../reality-source";
import { PageContainer } from "@/components/ui/page-container";

export default async function NewReframingPage({
  searchParams,
}: {
  searchParams: Promise<{ idea_id?: string; reality_version_id?: string }>;
}) {
  const params = await searchParams;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();
  const source = params.reality_version_id
    ? await loadOwnedRealityReasoningSnapshot(
        params.reality_version_id,
        user.id
      )
    : null;
  if (params.reality_version_id && !source) {
    return (
      <PageContainer width="narrow">
        <h1 className="text-xl font-semibold">现状来源不可用</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          该现状版本不存在或不属于当前用户。
        </p>
      </PageContainer>
    );
  }
  return (
    <PageContainer width="narrow">
      <div className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight">认知重构</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          描述你一时不知道怎么办的课题，AI 用 26 种视角帮你打破思维定势。
        </p>
      </div>
      <ReframingForm ideaId={params.idea_id ?? null} realitySource={source} />
    </PageContainer>
  );
}
