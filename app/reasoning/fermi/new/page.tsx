import { FermiForm } from "./fermi-form";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadOwnedRealityReasoningSnapshot } from "../../reality-source";

export default async function NewFermiEstimatePage({
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
      <div className="mx-auto max-w-xl px-4 py-12">
        <h1 className="text-xl font-semibold">现状来源不可用</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          该现状版本不存在或不属于当前用户。
        </p>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <div className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight">新建费米估算</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          把大问题拆解成可以相乘的小组成部分——比直接猜总数更可靠。
        </p>
      </div>
      <FermiForm ideaId={params.idea_id ?? null} realitySource={source} />
    </div>
  );
}
