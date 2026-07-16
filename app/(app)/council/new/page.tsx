import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listCouncilPersonas } from "@/app/(app)/council/queries";
import { NewCouncilForm } from "./new-council-form";

export const dynamic = "force-dynamic";

export default async function NewCouncilSessionPage({
  searchParams,
}: {
  searchParams: Promise<{ idea_id?: string }>;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const params = await searchParams;
  const ideaId = params.idea_id ?? null;
  const personas = await listCouncilPersonas(user.id);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-1 text-xl font-semibold tracking-tight">新建顾问团会话</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        选几位这次想听意见的顾问——不必人人都邀请，按你的想法和当下的问题挑就好。
      </p>
      <NewCouncilForm ideaId={ideaId} personas={personas} />
    </div>
  );
}
