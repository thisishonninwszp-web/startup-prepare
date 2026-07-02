import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OutsideViewForm } from "./outside-view-form";

export const dynamic = "force-dynamic";

export default async function NewOutsideViewPage({
  searchParams,
}: {
  searchParams: Promise<{ idea_id?: string; plan?: string }>;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const params = await searchParams;
  const ideaId = params.idea_id ?? null;
  const prePlan = params.plan ?? "";

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-1 text-xl font-semibold tracking-tight">外部视角/基础比率</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        别从你计划的内部细节推理。先看和你处境类似的一类案例最常见的结局和原因，再说明这次为什么可能不一样。
      </p>
      <OutsideViewForm ideaId={ideaId} prePlan={prePlan} />
    </div>
  );
}
